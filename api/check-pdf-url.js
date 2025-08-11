// api/check-pdf-url.js
import dotenv from 'dotenv';
import Airtable from 'airtable';

dotenv.config();

// ⚠️ Cambia por tu ID real si varía
const EXTENSION_ID = 'fapmbomkbbckmnpbeecncppfbmcabmbc';

const ALLOWED_ORIGINS = [
  `chrome-extension://${EXTENSION_ID}`,
  'http://localhost:3000',
  'https://backend-selltionia.vercel.app',
];

function applyCORS(req, res) {
  const origin = req.headers.origin || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

function normalizeProfileUrl(input) {
  try {
    const u = new URL(String(input));
    u.search = '';
    u.hash = '';
    const cleanPath = u.pathname.replace(/\/+$/, '');
    return `${u.origin}${cleanPath}`.toLowerCase();
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

/* ── Helpers Drive ────────────────────────────────────────────────────── */
function extractDriveFileId(u) {
  const s = String(u || '');
  let m = s.match(/\/file\/d\/([^/]+)/);
  if (m?.[1]) return m[1];
  m = s.match(/[?&]id=([^&]+)/); // open?id=..., uc?id=...
  if (m?.[1]) return m[1];
  return null;
}
function toDrivePreview(u) {
  const id = extractDriveFileId(u);
  if (id) return `https://drive.google.com/file/d/${id}/preview`;
  // /view → /preview
  if (/drive\.google\.com\/.*\/view(\?|$)/.test(String(u || ''))) {
    return String(u).replace('/view', '/preview');
  }
  return null;
}
function isDriveFolder(u) {
  return /drive\.google\.com\/(drive\/folders|folders|folder\/d)\//.test(String(u || ''));
}
/* ─────────────────────────────────────────────────────────────────────── */

export default async function handler(req, res) {
  if (applyCORS(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Usa POST con JSON.' });
  }

  const email = (req.body?.email || '').trim();
  const urlPerfilRaw = (req.body?.urlPerfil || '').trim();

  if (!email || !urlPerfilRaw) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros: email y urlPerfil.' });
  }

  let table;
  try {
    const { apiKey, baseId, tableName } = ensureEnv();
    const airtable = new Airtable({ apiKey });
    table = airtable.base(baseId)(tableName);
  } catch (e) {
    console.error('❌ Env error:', e.message);
    return res.status(500).json({ success: false, error: 'Configuración del servidor incompleta' });
  }

  try {
    const perfilNormalizado = normalizeProfileUrl(urlPerfilRaw);

    // Traemos registros del usuario (hasta 100) y ordenamos por createdTime desc en Node
    let records = await table
      .select({
        filterByFormula: `{UsuarioEmail} = '${email}'`,
        fields: ['UsuarioEmail', 'URLPerfil', 'URL_informePDF'],
        pageSize: 100
      })
      .all();

    records.sort((a, b) => {
      const ta = new Date(a._rawJson?.createdTime || 0).getTime();
      const tb = new Date(b._rawJson?.createdTime || 0).getTime();
      return tb - ta;
    });

    // Filtramos por URL de perfil normalizada e items con link
    const candidates = records.filter((r) => {
      const urlAir = normalizeProfileUrl(r.get('URLPerfil') || '');
      const link = r.get('URL_informePDF');
      return urlAir === perfilNormalizado && typeof link === 'string' && link.startsWith('http');
    });

    // Elegimos primero el que sea ARCHIVO (no carpeta) y que parezca PDF/archivo de Drive
    const best =
      candidates.find((r) => {
        const link = r.get('URL_informePDF');
        return !isDriveFolder(link) && (extractDriveFileId(link) || link.toLowerCase().endsWith('.pdf'));
      }) || candidates[0];

    if (!best) {
      console.log(`📝 No se encontró PDF para: ${email} | ${perfilNormalizado}`);
      return res.status(200).json({
        success: true,
        found: false,
        urlPDF: null,
        message: 'PDF aún no está disponible',
      });
    }

    let pdfUrl = best.get('URL_informePDF');

    // Normaliza cualquier enlace de Drive a /preview si es archivo
    const drivePreview = toDrivePreview(pdfUrl);
    if (drivePreview) pdfUrl = drivePreview;

    console.log(`✅ PDF encontrado: ${pdfUrl}`);
    return res.status(200).json({
      success: true,
      found: true,
      urlPDF: pdfUrl,
      recordId: best.id,
    });
  } catch (err) {
    console.error('❌ Error consultando Airtable:', err?.message || err);
    const msg = err?.message || 'Error interno';
    if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
      return res.status(503).json({ success: false, error: 'Error de conectividad con Airtable' });
    }
    return res.status(500).json({ success: false, error: msg });
  }
}
