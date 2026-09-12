# Looker signed SSO embed — reference

This repo is a small Express app that embeds Looker **dashboard 2644** for people who **do not** have a Looker login.

Live example (when env vars are set on Render):  
https://embeding-with-looker.onrender.com/

Official docs:

- [Signed embedding](https://cloud.google.com/looker/docs/signed-embedding)
- [Create Signed Embed Url API](https://cloud.google.com/looker/docs/reference/looker-api/latest/methods/Auth/create_sso_embed_url)
- [Embed SDK](https://cloud.google.com/looker/docs/embed-sdk-intro)

---

## What this project does

Visitors open the web app. The **backend** calls Looker REST API and gets a **short-lived signed URL**. The **frontend** puts that URL in an iframe. Looker treats the visitor as an **embed user** (`external_user_id`), not a normal Looker account.

```text
Browser                    Express (index.js)              Looker
  |                              |                              |
  |  GET /api/looker-embed       |                              |
  | ---------------------------> |  login: client_id/secret      |
  |                              | ---------------------------> |
  |                              |  POST /api/4.0/embed/sso_url |
  |                              |  (dashboard, permissions…)    |
  |                              | <--------------------------- |
  |                              |  signed URL (HMAC inside     |
  |                              |  Looker using embed secret)    |
  |  { "url": "https://..." }    |                              |
  | <--------------------------- |                              |
  | iframe src = url --------------------------------------> |
  |                              |     Looker verifies HMAC     |
  |                              |     then shows dashboard       |
```

**Frontend never gets secrets.** It only gets `url`.

---

## Questions to ask when someone wants a Looker embed

Copy this into a kickoff. Fill it before writing code.

### The web app

1. Is this **internal** (staff already in Looker) or **customer-facing** (no Looker accounts)?  
   Customer-facing → signed SSO embed (this repo).
2. What is the **frontend**? React / Vue / HTML? SPA? Where should the dashboard sit (page, tab, modal)?
3. Is there a **backend** that can call Looker API? Signing **must** happen on a server. Secrets must not live in the browser.
4. How do users log into **this** app today (Google, Cognito, none)?  
   That maps to `external_user_id`.
5. Where is it **hosted**? What is the public origin?  
   Local: `http://localhost:3000`  
   This app on Render: `https://embeding-with-looker.onrender.com`  
   That origin is `LOOKER_EMBED_DOMAIN` and must be on Looker’s **Embed Domain Allowlist**.

### Looker

6. Looker instance URL? (example: `https://panderasystems.looker.com`)
7. Dashboard id or LookML id? (example: `2644`)
8. Which LookML **models**? (example: `Datamodel`)
9. Which **permissions**? View-only is often `access_data`, `see_looks`, `see_user_dashboards`.
10. Same data for everyone, or **row-level** by customer?  
    If per customer: `user_attributes` / `access_filters` and usually a **closed system**.
11. Is **signed embedding** enabled in Admin → Embed?
12. Who can issue **API3 client id / secret** (API user with rights to call `create_sso_embed_url`)?
13. Session length? (this app uses 3600 seconds)
14. Safari / third-party cookies? If iframe fails only in Safari, plan **cookieless embed**.

### Security

15. Where do secrets live? Local `.env` (gitignored). Prod: host env vars or Secret Manager. **Never GitHub.**
16. Unique `external_user_id` per person in production, not one global `test` if tenants must be isolated.

Kickoff sentence:

> We need a backend that authenticates to Looker’s API and creates a signed SSO URL per visitor, and a frontend that iframes that URL. Users do not need Looker logins. I need: how this app authenticates users, frontend stack, hosting origin for the allowlist, dashboard id, models, permissions, whether data is shared or filtered, and who enables signed embed and issues API credentials.

---

## What you need (checklist)

### Looker Admin (already in Looker, not in this repo)

| Item | This project |
|---|---|
| Signed embedding enabled | Required |
| **Embed secret** | Stored **in Looker**. The app never has it. Looker uses it to HMAC-sign the URL. |
| Embed Domain Allowlist | `http://localhost:3000` and `https://embeding-with-looker.onrender.com` |
| API3 client id + secret | In `.env` / Render env only |
| Dashboard | `2644` |
| Model | `Datamodel` |
| Permissions | `access_data`, `see_looks`, `see_user_dashboards` |

### App env vars

Never commit `.env`. Example for **local**:

```env
PORT=3000
LOOKERSDK_BASE_URL=https://panderasystems.looker.com
LOOKERSDK_CLIENT_ID=your_api_client_id
LOOKERSDK_CLIENT_SECRET=your_api_client_secret
LOOKER_DASHBOARD_ID=2644
LOOKER_EMBED_DOMAIN=http://localhost:3000
```

On **Render**, set the same keys in **Environment**. Use:

```text
LOOKER_EMBED_DOMAIN=https://embeding-with-looker.onrender.com
```

Do not set `PORT` on Render; Render assigns it.

### Two different secrets (easy to confuse)

| Secret | In this app’s `.env`? | Role |
|---|---|---|
| **API client id / secret** | Yes | Backend logs into Looker REST API |
| **Embed secret** | No | Already in Looker Admin. Looker HMAC-signs the URL. **Not** retrieved via client id/secret. |

Client id/secret = “this server may call the API.”  
Embed secret = “this URL is a valid SSO ticket.” Looker keeps the stamp; your app never copies it.

---

## How the code is split

| Piece | File | Job |
|---|---|---|
| Backend | `index.js` | Looker SDK, `create_sso_embed_url`, return `{ url }` |
| Frontend | `public/index.html` | `fetch('/api/looker-embed')`, set `iframe.src` |
| Secrets | `.env` or Render env | API credentials + embed domain |

Looker UI **Get embed URL**:

- **Copy Link** — one-time test URL. Do not hardcode. It expires.
- **SDK Call** — same idea as `index.js` (API).
- **Embed SDK Call** — JS library; this demo uses a plain iframe instead.

---

## HMAC (what `signature=` is)

**HMAC** = Hash-based Message Authentication Code.

Looker takes the embed fields (path, permissions, user, time, nonce, …) plus the **embed secret** and produces `signature`. If anyone edits the URL, HMAC fails and Looker rejects it.

HMAC is **not encryption**. You can still read `external_user_id` and models in the URL. It only **seals** them.

`nonce` + `time` + `session_length` stop unlimited reuse of an old URL.

This repo does **not** compute HMAC in Node. Looker does it when you call `POST /embed/sso_url`.

---

## Payloads

### 1. Backend → Looker API (JSON)

`LookerNodeSDK` sends something like:

```json
{
  "target_url": "https://panderasystems.looker.com/embed/dashboards/2644",
  "session_length": 3600,
  "force_logout_login": true,
  "external_user_id": "public-viewer",
  "first_name": "Embed",
  "last_name": "Viewer",
  "permissions": ["access_data", "see_looks", "see_user_dashboards"],
  "models": ["Datamodel"],
  "access_filters": {},
  "user_attributes": {},
  "embed_domain": "http://localhost:3000"
}
```

API: `POST /api/4.0/embed/sso_url` after `POST /api/4.0/login`.

Do **not** change the URL Looker returns. That breaks `signature`.

### 2. Looker → backend (signed URL shape)

```text
https://INSTANCE/login/embed/{ENCODED_PATH}?{params}&signature=HMAC
```

`ENCODED_PATH` for dashboard 2644:

```text
%2Fembed%2Fdashboards%2F2644
```

which is `/embed/dashboards/2644`. `/login/embed/%2Fembed/...` (embed twice) is **correct**.

Decoded query params (this app):

| Param | Example |
|---|---|
| `permissions` | `["access_data","see_looks","see_user_dashboards"]` |
| `models` | `["Datamodel"]` |
| `external_user_id` | `"public-viewer"` |
| `first_name` / `last_name` | `"Embed"` / `"Viewer"` |
| `access_filters` | `{}` |
| `user_attributes` | `{}` |
| `session_length` | `3600` |
| `force_logout_login` | `true` |
| `nonce` | random (Looker) |
| `time` | Unix time (Looker) |
| `signature` | HMAC (Looker) |

Frontend receives:

```json
{ "url": "https://panderasystems.looker.com/login/embed/...." }
```

---

## Run locally

```bash
cd my-render-app
npm install
# create .env (see above), save the file
node index.js
```

Open http://localhost:3000

`LookerNodeSDK.init40(new NodeSettings('LOOKERSDK'))` reads `LOOKERSDK_*` from the environment. Bare `init40()` looks for `looker.ini` and fails with `Missing required configuration values like base_url`.

---

## Deploy (Render)

1. Push this repo (`.env` is gitignored on purpose).
2. Render → Environment: set the Looker variables. `LOOKER_EMBED_DOMAIN` must be the **Render** origin.
3. Redeploy. Log should not say `injected env (0) from .env` for Looker keys — those come from Render Environment, not a file. The app reads `process.env` either way.
4. Allowlist the Render origin in Looker.

Production later: GCP Secret Manager / AWS Secrets Manager inject the **same** env var names. The Node code stays `process.env.LOOKERSDK_CLIENT_SECRET`.

---

## Troubleshooting (from building this app)

| Symptom | Cause |
|---|---|
| `injected env (1)` / missing `LOOKERSDK_*` locally | `.env` not saved; only `PORT` on disk |
| `Missing required configuration values like base_url` | SDK not reading env (`NodeSettings`) or env empty |
| Render: `injected env (0)` + missing Looker vars | Secrets not set in Render Environment |
| Page red: “Could not load the Looker dashboard” | `/api/looker-embed` 500 (usually missing env) |
| Iframe blank, API returns a `url` | `X-Frame-Options: SAMEORIGIN` → origin not on **Embed Domain Allowlist**, or `embed_domain` mismatch |
| Hardcoded Copy Link URL | Expired / bound to old nonce — always mint a new URL |

---

## This demo vs a real product

| This demo | Real app |
|---|---|
| `external_user_id: public-viewer` for everyone | Map to the logged-in user’s id |
| Empty `user_attributes` | Pass tenant / brand / region |
| iframe | Often `@looker/embed-sdk` for events and filters |
| One dashboard id in env | Path or query: `/dashboards/:id` |

---

## Repo map

```text
index.js              Express + Looker signed URL API
public/index.html     Page + iframe
package.json          express, dotenv, @looker/sdk-node
render.yaml           Render web service start: node index.js
.gitignore            node_modules, .env
```
