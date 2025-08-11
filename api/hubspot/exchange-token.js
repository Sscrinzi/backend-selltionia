// api/hubspot/exchange-token.js
import dotenv from 'dotenv';
dotenv.config();

const EXTENSION_ID = 'fapmbomkbbckmnpbeecncppfbmcabmbc';
const ALLOWED_ORIGINS = [
  `chrome-extension://${EXTENSION_ID}`,
  'http://localhost:3000',
  'https://backend-selltionia.vercel.app',
];

function cors(req, res) {
  const origin = req.headers.origin || '';
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Use POST' });

  const { code, redirect_uri } = req.body || {};
  if (!code || !redirect_uri) return res.status(400).json({ success:false, error:'code y redirect_uri requeridos' });

  const client_id = process.env.HUBSPOT_CLIENT_ID;
  const client_secret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!client_id || !client_secret) return res.status(500).json({ success:false, error:'Faltan credenciales en el servidor' });

  try {
    const r = await fetch('https://api.hubapi.com/oauth/v1/token', {
      method: 'POST',
      headers: { 'Content-Type':'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id,
        client_secret,
        redirect_uri,
        code
      })
    });

    const data = await r.json().then(x => x).catch(() => ({}));
    if (!r.ok) {
      console.error('[EXCHANGE FAIL]', data);
      return res.status(r.status).json({ success:false, error: data?.message || 'Intercambio falló', details: data });
    }

    // devuelve tal cual a la extensión
    return res.status(200).json({ success:true, tokens: data });
  } catch (e) {
    console.error('[EXCHANGE ERROR]', e);
    return res.status(500).json({ success:false, error: e.message || 'Error desconocido' });
  }
}
