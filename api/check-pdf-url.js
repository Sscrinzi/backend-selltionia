// api/check-pdf-url.js
import dotenv from 'dotenv';
import Airtable from 'airtable';

dotenv.config();

// ⚠️ Ajusta si cambia tu ID de extensión
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
  if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
  return false;
}

function normalizeProfileUrl(input) {
  try {
    const u = new URL(String(input));
    u.search = ''; u.hash = '';
    const cleanPath = u.pathname.replace(/\/+$/, '');
    return `${u.origin}${cleanPath}`.toLowerCase();
  } catch {
    return String(input).split('?')[0].replace(/\/+$/, '').toLowerCase();
  }
}

function extractLinkedinHandle(u) {
  try {
    const m = String(u).match(/linkedin\.com\/in\/([^\/?#]+)/i);
    return m?.[1] || '';
  } catch { return ''; }
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
  if (/drive\.google\.com\/.*\/view(\?|$)/i.test(String(u || ''))) {
    return String(u).replace('/view', '/preview');
  }
  return null;
}
function isDriveFolder(u) {
  return /drive\.google\.com\/(drive\/folders|folders|folder\/d)\//i.test(String(u || ''));
}
/* ─────────────────────────────────────────────────────────────────────── */

function esc(s) { return String(s || '').replace(/'/g, "\\'"); }

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
    table = new Airtable({ apiKey }).base(baseId)(tableName);
  } catch (e) {
    console.error('❌ Env error:', e.message);
    return res.status(500).json({ success: false, error: 'Configuración del servidor incompleta' });
  }

  try {
    const perfilNormalizado = normalizeProfileUrl(urlPerfilRaw);

    // Variantes para buscar en Airtable
    const rawNoQuery = String(urlPerfilRaw).split('?')[0].trim();
    const rawNoTrailing = rawNoQuery.replace(/\/+$/, '');
    const rawWithSlash = rawNoTrailing + '/';
    const handle = extractLinkedinHandle(urlPerfilRaw); // marta-marcilla-alonso-b4548a158

    // Una sola query amplia: por email o por URL/handle (SEARCH es case-insensitive en Airtable)
    const formula = `OR(
      {UsuarioEmail}='${esc(email)}',
      SEARCH('${esc(rawNoTrailing)}',{URLPerfil})>0,
      SEARCH('${esc(rawWithSlash)}',{URLPerfil})>0,
      ${handle ? `SEARCH('${esc(handle)}',{URLPerfil})>0` : 'FALSE()'}
    )`;

    let records = await table
      .select({
        filterByFormula: formula,
        fields: ['UsuarioEmail', 'URLPerfil', 'URL_informePDF'],
        pageSize: 100
      })
      .all();

    // Ordenar por createdTime desc
    records.sort((a, b) => {
      const ta = new Date(a._rawJson?.createdTime || 0).getTime();
      const tb = new Date(b._rawJson?.createdTime || 0).getTime();
      return tb - ta;
    });

    // Solo con link http(s)
    const withLink = records.filter(r => {
      const link = r.get('URL_informePDF');
      return typeof link === 'string' && /^https?:\/\//i.test(link);
    });

    if (!withLink.length) {
      console.log(`📝 Sin links en registros para: ${email} | ${perfilNormalizado}`);
      return res.status(200).json({ success: true, found: false, urlPDF: null, message: 'PDF aún no está disponible' });
    }

    const normEq = (r) => normalizeProfileUrl(r.get('URLPerfil') || '') === perfilNormalizado;
    const normLoose = (r) => {
      const u = normalizeProfileUrl(r.get('URLPerfil') || '');
      return u.startsWith(perfilNormalizado) || perfilNormalizado.startsWith(u);
    };

    const strict = withLink.filter(normEq);
    const loose  = withLink.filter(normLoose);

    const isFileLink = (link) =>
      !isDriveFolder(link) && (extractDriveFileId(link) || String(link).toLowerCase().endsWith('.pdf'));

    const pickFile = (list) => list.find(r => isFileLink(r.get('URL_informePDF')));

    // Preferencias: strict-file > loose-file > any-file > strict-any > loose-any > any
    const best =
      pickFile(strict) ||
      pickFile(loose)  ||
      pickFile(withLink) ||
      strict[0] || loose[0] || withLink[0];

    if (!best) {
      return res.status(200).json({ success: true, found: false, urlPDF: null, message: 'PDF aún no está disponible' });
    }

    let link = best.get('URL_informePDF');
    const drivePreview = toDrivePreview(link);
    if (drivePreview) link = drivePreview;

    const kind = isDriveFolder(link) ? 'folder'
               : (extractDriveFileId(link) || String(link).toLowerCase().endsWith('.pdf')) ? 'file'
               : 'unknown';

    console.log(`✅ PDF encontrado (${kind}): ${link}`);
    return res.status(200).json({
      success: true,
      found: true,
      urlPDF: link,
      driveKind: kind,
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
