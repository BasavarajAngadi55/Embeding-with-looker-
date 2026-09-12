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

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/status', (req, res) => {
  res.json({ status: 'App is running successfully!' });
});

app.get('/api/looker-embed', async (req, res) => {
  try {
    const dashboardId = process.env.LOOKER_DASHBOARD_ID || '2644';
    const lookerHost = process.env.LOOKERSDK_BASE_URL;
    const looker = getLookerSdk();
    const result = await looker.ok(
      looker.create_sso_embed_url({
        target_url: `${lookerHost}/embed/dashboards/${dashboardId}`,
        session_length: 3600,
        force_logout_login: true,
        external_user_id: 'public-viewer',
        first_name: 'Embed',
        last_name: 'Viewer',
        permissions: ['access_data', 'see_looks', 'see_user_dashboards'],
        models: ['Datamodel'],
        access_filters: {},
        user_attributes: {},
        embed_domain: process.env.LOOKER_EMBED_DOMAIN,
      })
    );

    res.json({ url: result.url });
  } catch (error) {
    console.error('Looker embed URL failed:', error);
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
