import axios from 'axios';

export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI;

  try {
    const tokenRes = await axios.post('https://api.hubapi.com/oauth/v1/token', new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code
    }), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    // Opción: podés guardar este token en Airtable o DB si querés
    return res.status(200).json({
      access_token: tokenRes.data.access_token,
      refresh_token: tokenRes.data.refresh_token,
      expires_in: tokenRes.data.expires_in,
      user: tokenRes.data.user_id,
      scope: tokenRes.data.scope
    });

  } catch (error) {
    console.error('Error al intercambiar token:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Error al intercambiar token', details: error.response?.data || error.message });
  }
}
