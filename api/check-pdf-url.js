// api/check-pdf-url.js
import dotenv from 'dotenv';
import Airtable from 'airtable';
dotenv.config();

// --- CORS: permitir extensión de PROD + TEST sin tocar código ---
const DEFAULT_EXTENSION_IDS = [
  'eilckjfihngldoedpfdnhpponpbaphig', // PROD (Chrome Web Store)
  'fapmbomkbbckmnpbeecncppfbmcabmbc', // TEST (modo dev)
];

// Puedes sobreescribir por .env (EXTENSION_IDS=prod,test,otro)
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
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

const isDriveFile   = (u='') => /drive\.google\.com\/file\/d\//.test(u);
const isDriveFolder = (u='') => /drive\.google\.com\/folder\/d\//.test(u);
const toPreview = (u='') => {
  if (isDriveFile(u)) {
    const m = u.match(/\/file\/d\/([^/]+)/);
    return m?.[1] ? `https://drive.google.com/file/d/${m[1]}/preview` : u;
  }
  return u;
};

function normalizeProfileUrl(input) {
  try {
    const u = new URL(String(input));
    u.search = ''; u.hash = '';
    return `${u.origin}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return String(input).split('?')[0].replace(/\/+$/, '').toLowerCase();
  }
}

function ensureEnv() {
  const apiKey = process.env.AIRTABLE_API_KEY || process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME;
  if (!apiKey || !baseId || !tableName) {
    throw new Error('Configuración de Airtable incompleta (API_KEY/TOKEN, BASE_ID, TABLE_NAME)');
  }
  return { apiKey, baseId, tableName };
}

export default async function handler(req, res) {
  if (applyCORS(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Usa POST con JSON.' });
  }

  const email = (req.body?.email || '').trim();
  const urlPerfilRaw = (req.body?.urlPerfil || '').trim();
  const recordId = (req.body?.recordId || '').trim();

  if (!email || !urlPerfilRaw) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros: email y urlPerfil.' });
  }

  let table;
  try {
    const { apiKey, baseId, tableName } = ensureEnv();
    table = new Airtable({ apiKey }).base(baseId)(tableName);
  } catch (e) {
    console.error('❌ Env error:', e.message);
    return res.status(500).json({ success: false, error: 'Configuración del servidor incompleta' });
  }

  // 👉 1) Si viene recordId, usarlo como filtro duro
  if (recordId) {
    try {
      const rec = await table.find(recordId);
      let pdfUrl = rec.get('URL_informePDF') || null;

      if (!pdfUrl) {
        return res.status(200).json({ success: true, found: false, urlPDF: null, recordId });
      }

      let driveKind = null;
      if (isDriveFolder(pdfUrl)) driveKind = 'folder';
      if (isDriveFile(pdfUrl))   driveKind = 'file';

      if (driveKind === 'file') pdfUrl = toPreview(pdfUrl);

      return res.status(200).json({
        success: true,
        found: true,
        urlPDF: pdfUrl,
        driveKind,
        recordId, // echo back
      });
    } catch (e) {
      console.warn('recordId no encontrado, uso búsqueda por email/URL:', recordId, e?.message);
    }
  }

  // 👉 2) Fallback: búsqueda por email y match por URL normalizada
  try {
    const perfilNormalizado = normalizeProfileUrl(urlPerfilRaw);

    const records = await table
      .select({
        filterByFormula: `{UsuarioEmail} = '${email}'`,
        fields: ['UsuarioEmail', 'URLPerfil', 'URL_informePDF'],
        pageSize: 25,
      })
      .all();

    // Prefer exact URL match
    let found = records.find(r => {
      const hasPdf = typeof r.get('URL_informePDF') === 'string' && r.get('URL_informePDF').startsWith('http');
      return hasPdf && normalizeProfileUrl(r.get('URLPerfil') || '') === perfilNormalizado;
    });

    // Loose match if needed
    if (!found) {
      found = records.find(r => {
        const hasPdf = typeof r.get('URL_informePDF') === 'string' && r.get('URL_informePDF').startsWith('http');
        const urlAir = normalizeProfileUrl(r.get('URLPerfil') || '');
        return hasPdf && (urlAir.startsWith(perfilNormalizado) || perfilNormalizado.startsWith(urlAir));
      });
    }

    if (!found) {
      return res.status(200).json({ success: true, found: false, urlPDF: null, message: 'PDF aún no está disponible' });
    }

    let pdfUrl = found.get('URL_informePDF') || null;
    let driveKind = null;
    if (isDriveFolder(pdfUrl)) driveKind = 'folder';
    if (isDriveFile(pdfUrl))   driveKind = 'file';
    if (driveKind === 'file') pdfUrl = toPreview(pdfUrl);

    return res.status(200).json({
      success: true,
      found: true,
      urlPDF: pdfUrl,
      driveKind,
      recordId: found.id,
    });
  } catch (err) {
    console.error('❌ Error consultando Airtable:', err?.message || err);
    return res.status(500).json({ success: false, error: err?.message || 'Error interno' });
  }
}
