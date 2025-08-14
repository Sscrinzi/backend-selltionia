// pages/api/airtable/append-user-data.js
import dotenv from 'dotenv';
import Airtable from 'airtable';

dotenv.config();

// --- CORS: permitir extensión de PROD + TEST sin tocar código ---
const DEFAULT_EXTENSION_IDS = [
  'eilckjfihngldoedpfdnhpponpbaphig', // PROD (Chrome Web Store)
  'fapmbomkbbckmnpbeecncppfbmcabmbc', // TEST (modo dev)
];

const EXTENSION_IDS = (process.env.EXTENSION_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const EFFECTIVE_IDS = EXTENSION_IDS.length ? EXTENSION_IDS : DEFAULT_EXTENSION_IDS;

const EXTENSION_ORIGINS = Array.from(
  new Set(EFFECTIVE_IDS.map(id => `chrome-extension://${id}`))
);

// Orígenes extra que ya permitías
const STATIC_ORIGINS = [
  'http://localhost:3000',
  'https://backend-selltionia.vercel.app',
];

// Lista final de orígenes permitidos
const ALLOWED_ORIGINS = Array.from(new Set([...EXTENSION_ORIGINS, ...STATIC_ORIGINS]));

function applyCORS(req, res) {
  const origin = req.headers.origin || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

function ensureEnv() {
  const apiKey = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME || 'users_data';
  if (!apiKey || !baseId || !tableName) {
    throw new Error('Faltan variables de entorno de Airtable (API_KEY/TOKEN, BASE_ID, TABLE_NAME)');
  }
  return { apiKey, baseId, tableName };
}

export default async function handler(req, res) {
  if (applyCORS(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Usa POST.' });
  }

  const fields = req.body?.fields;
  if (!fields || typeof fields !== 'object') {
    return res.status(400).json({ success: false, error: 'Body inválido. Se espera { fields: { ... } }' });
  }

  let base, tableName;
  try {
    const { apiKey, baseId, tableName: tName } = ensureEnv();
    Airtable.configure({ apiKey });
    base = new Airtable({ apiKey }).base(baseId);
    tableName = tName;
  } catch (e) {
    console.error('❌ Env error:', e.message);
    return res.status(500).json({ success: false, error: 'Configuración del servidor incompleta' });
  }

  try {
    // Normaliza fecha si viene vacía
    if (!fields.fecha) fields.fecha = new Date().toISOString();

    const created = await base(tableName).create([{ fields }], { typecast: true });
    const record = created?.[0];
    return res.status(200).json({
      success: true,
      recordId: record?.id || null,
      fields: record?._rawJson?.fields || fields
    });
  } catch (err) {
    console.error('❌ Error creando registro en Airtable:', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Error interno' });
  }
}
