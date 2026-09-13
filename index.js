const express = require('express');
const path = require('path');
const { LookerNodeSDK, NodeSettings } = require('@looker/sdk-node');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Built on first request so that missing Looker config surfaces as an API
// error instead of preventing the whole server from starting. NodeSettings
// reads LOOKERSDK_* from the environment; init40() with no arguments would
// instead look for a looker.ini file on disk.
let sdk;
function getLookerSdk() {
  if (!sdk) {
    const missing = [
      'LOOKERSDK_BASE_URL',
      'LOOKERSDK_CLIENT_ID',
      'LOOKERSDK_CLIENT_SECRET',
    ].filter((name) => !process.env[name]);

    if (missing.length > 0) {
      throw new Error(`Missing environment variables: ${missing.join(', ')}`);
    }

    sdk = LookerNodeSDK.init40(new NodeSettings('LOOKERSDK'));
  }

  return sdk;
}

// Looker signs the URL with the embed secret held in its own admin settings,
// so the returned string must be passed to the browser unmodified.
async function signEmbedUrl(embedPath, permissions) {
  const looker = getLookerSdk();
  const result = await looker.ok(
    looker.create_sso_embed_url({
      target_url: `${process.env.LOOKERSDK_BASE_URL}${embedPath}`,
      session_length: 3600,
      force_logout_login: true,
      external_user_id: 'public-viewer',
      first_name: 'Embed',
      last_name: 'Viewer',
      permissions,
      models: (process.env.LOOKER_MODELS || 'Datamodel').split(','),
      access_filters: {},
      user_attributes: {},
      embed_domain: process.env.LOOKER_EMBED_DOMAIN,
    })
  );

  return result.url;
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
  res.json({ status: 'App is running successfully!' });
});

app.get('/api/looker-embed', async (req, res) => {
  try {
    const dashboardId = process.env.LOOKER_DASHBOARD_ID || '2644';
    const url = await signEmbedUrl(`/embed/dashboards/${dashboardId}`, [
      'access_data',
      'see_looks',
      'see_user_dashboards',
    ]);

    res.json({ url });
  } catch (error) {
    console.error('Looker embed URL failed:', error);
    res.status(500).json({ error: String(error.message || error) });
  }
});

// Conversational Analytics needs the Gemini permissions as well, and the embed
// user needs View access on the underlying data agent.
app.get('/api/looker-conversation', async (req, res) => {
  try {
    const conversationId = process.env.LOOKER_CONVERSATION_ID;

    if (!conversationId) {
      throw new Error('Missing environment variable: LOOKER_CONVERSATION_ID');
    }

    const url = await signEmbedUrl(`/embed/conversations/${conversationId}`, [
      'access_data',
      'see_looks',
      'see_user_dashboards',
      'explore',
      'gemini_in_looker',
      'chat_with_agent',
      'chat_with_explore',
    ]);

    res.json({ url });
  } catch (error) {
    console.error('Looker conversation URL failed:', error);
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
