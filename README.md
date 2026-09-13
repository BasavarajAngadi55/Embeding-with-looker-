# Looker signed SSO embed — reference

This repo is a small Express app that embeds Looker content for people who **do not** have a Looker login:

- **Dashboard:** [https://embeding-with-looker.onrender.com/](https://embeding-with-looker.onrender.com/) (`public/index.html`)
- **Conversational agent:** [https://embeding-with-looker.onrender.com/conversation.html](https://embeding-with-looker.onrender.com/conversation.html)

Both use the **same** signed SSO flow. What changes is the **embed path**, **permissions**, and **Looker Admin extras**.

Official docs:

- [Signed embedding](https://cloud.google.com/looker/docs/signed-embedding)
- [Create Signed Embed Url API](https://cloud.google.com/looker/docs/reference/looker-api/latest/methods/Auth/create_sso_embed_url)
- [Embedding Conversational Analytics](https://docs.cloud.google.com/looker/docs/conversational-analytics-looker-embedding)
- [Embed SDK](https://cloud.google.com/looker/docs/embed-sdk-intro)

---

## Dashboard vs conversational agent — what to change

The backend always calls `create_sso_embed_url`. You only swap **target URL** and **permissions**.

| | **Dashboard** | **Conversational agent** |
|---|---|---|
| Visitor URL in this app | `/` | `/conversation.html` |
| Backend route | `GET /api/looker-embed` | `GET /api/looker-conversation` |
| Frontend file | `public/index.html` | `public/conversation.html` |
| Looker content URL | `https://…/dashboards/2644` | `https://…/conversations/{conversation_id}` |
| **target_url (signed)** | `/embed/dashboards/2644` | `/embed/conversations/{id}` |
| Env var for content | `LOOKER_DASHBOARD_ID=2644` | `LOOKER_CONVERSATION_ID=e9394641…` (example) |
| Permissions | `access_data`, `see_looks`, `see_user_dashboards` | Those **plus** `explore`, `gemini_in_looker`, `chat_with_agent`, `chat_with_explore` |
| Looker Admin extras | Signed embed + allowlist | Same, **plus** Gemini in Looker enabled, Looker 25.18+, **View** access on the **data agent** for the embed user |
| Allowlist / API keys / embed secret | Same for both | Same for both |
| `LOOKER_EMBED_DOMAIN` | Same origin (`localhost` or Render URL) | Same |

**Do not change for either type:** API client id/secret, embed secret (stays in Looker), HMAC signing, iframe pattern, `external_user_id`, models (`Datamodel` unless the agent uses other models).

If the agent’s Explores sit on a **different model**, set `LOOKER_MODELS` (comma-separated) to those model names. Permissions are **model-specific**; wrong model = chat 404 / permission error inside the iframe.

### Dashboard-only Looker Admin

1. Enable signed embedding; keep embed secret in Looker.
2. Allowlist `http://localhost:3000` and `https://embeding-with-looker.onrender.com`.
3. Confirm dashboard **2644** is visible to model `Datamodel`.
4. API3 keys for `create_sso_embed_url`.

### Conversational-agent extra Looker Admin

On top of the dashboard list:

1. Gemini in Looker turned on ([setup](https://docs.cloud.google.com/looker/docs/conversational-analytics-looker-setup)).
2. Conversation id from the URL:  
   `https://panderasystems.looker.com/conversations/{THIS_ID}`  
   Embed path is `/embed/conversations/{THIS_ID}` — not the non-embed URL.
3. Share the **data agent** with the embed user (or a group you put in `group_ids`) at **View**. Model permissions alone are not enough.
4. Optional: embed all agents at `/embed/agents` or the conversations home at `/embed/conversations` (no id). This demo pins one conversation id.

### Env vars to add for the agent (Render + local)

Already needed for dashboard:

```env
LOOKERSDK_BASE_URL=https://panderasystems.looker.com
LOOKERSDK_CLIENT_ID=...
LOOKERSDK_CLIENT_SECRET=...
LOOKER_DASHBOARD_ID=2644
LOOKER_EMBED_DOMAIN=http://localhost:3000
```

**Add for conversation:**

```env
LOOKER_CONVERSATION_ID=e9394641252944d4bb0dcc1bcc18615e
# optional if Explores are not only Datamodel:
# LOOKER_MODELS=Datamodel
```

On Render, `LOOKER_EMBED_DOMAIN` must be `https://embeding-with-looker.onrender.com`, and `LOOKER_CONVERSATION_ID` must be set there too (not only in local `.env`).

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
7. What content? **Dashboard** id, **conversation** id, and/or **agent** id?
8. Which LookML **models**? (example: `Datamodel`) — agent Explores must be on these models.
9. Which **permissions**? Dashboard view-only vs Gemini `chat_with_agent` / `chat_with_explore`.
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
| Dashboard | `2644` → `/embed/dashboards/2644` |
| Conversation | env `LOOKER_CONVERSATION_ID` → `/embed/conversations/{id}` |
| Model | `Datamodel` (override with `LOOKER_MODELS`) |
| Dashboard permissions | `access_data`, `see_looks`, `see_user_dashboards` |
| Conversation permissions | dashboard set **plus** `explore`, `gemini_in_looker`, `chat_with_agent`, `chat_with_explore` |

### App env vars

Never commit `.env`. Example for **local**:

```env
PORT=3000
LOOKERSDK_BASE_URL=https://panderasystems.looker.com
LOOKERSDK_CLIENT_ID=your_api_client_id
LOOKERSDK_CLIENT_SECRET=your_api_client_secret
LOOKER_DASHBOARD_ID=2644
LOOKER_CONVERSATION_ID=your_conversation_id
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
| Backend | `index.js` | `signEmbedUrl()`, `/api/looker-embed`, `/api/looker-conversation` |
| Dashboard UI | `public/index.html` | `fetch('/api/looker-embed')` |
| Conversation UI | `public/conversation.html` | `fetch('/api/looker-conversation')` |
| Secrets | `.env` or Render env | API credentials + ids + embed domain |

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

Dashboard example (`/api/looker-embed`):

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

Conversation example — same fields, different `target_url` and `permissions`:

```json
{
  "target_url": "https://panderasystems.looker.com/embed/conversations/YOUR_CONVERSATION_ID",
  "permissions": [
    "access_data",
    "see_looks",
    "see_user_dashboards",
    "explore",
    "gemini_in_looker",
    "chat_with_agent",
    "chat_with_explore"
  ]
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

- Dashboard: http://localhost:3000  
- Conversation: http://localhost:3000/conversation.html

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
| Conversation iframe signs (302) then 404 / no agent | Missing Gemini perms, or embed user has no **View** on the data agent |
| Missing `LOOKER_CONVERSATION_ID` | Set in `.env` and Render Environment |
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
index.js                    Express + dashboard + conversation signed URLs
public/index.html           Dashboard iframe
public/conversation.html    Conversational Analytics iframe
package.json                express, dotenv, @looker/sdk-node
render.yaml                 start: node index.js
.gitignore                  node_modules, .env
```
