// pages/api/check-pdf-url.js
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
  // res.setHeader('Access-Control-Allow-Credentials', 'true'); // solo si usas cookies

  if (req.method === 'OPTIONS') {
    res.status(204).end(); // preflight OK
    return true;
  }
  return false;
}

function normalizeProfileUrl(input) {
  try {
    const u = new URL(String(input));
    u.search = '';
    u.hash = '';
    // quitar barra final doble o simple
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

export default async function handler(req, res) {
  if (applyCORS(req, res)) return;

  // ✅ Solo POST con JSON
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Usa POST con JSON.' });
  }

  const email = (req.body?.email || '').trim();
  const urlPerfilRaw = (req.body?.urlPerfil || '').trim();

  if (!email || !urlPerfilRaw) {
    return res.status(400).json({ success: false, error: 'Faltan parámetros: email y urlPerfil.' });
  }

  let base, tableName;
  try {
    const { apiKey, baseId, tableName: tName } = ensureEnv();
    Airtable.configure({ apiKey });
    base = new Airtable.Base(baseId);
    tableName = tName;
  } catch (e) {
    console.error('❌ Env error:', e.message);
    return res.status(500).json({ success: false, error: 'Configuración del servidor incompleta' });
  }

  try {
    const perfilNormalizado = normalizeProfileUrl(urlPerfilRaw);

    // 1) Intento estricto: filtrar por email desde Airtable (reduce resultados) y luego matchear URL normalizada en Node
    const records = await base(tableName)
      .select({
        filterByFormula: `{UsuarioEmail} = '${email}'`,
        fields: ['UsuarioEmail', 'URLPerfil', 'URL_informePDF'],
        pageSize: 25,
      })
      .all();

    const match = records.find((r) => {
      const urlAir = normalizeProfileUrl(r.get('URLPerfil') || '');
      const hasPdf = typeof r.get('URL_informePDF') === 'string' && r.get('URL_informePDF').startsWith('http');
      return hasPdf && urlAir === perfilNormalizado;
    });

    // 2) Fallback (opcional): si no encontró, probamos una coincidencia startsWith (por si Airtable guarda o no el /in/)
    const matchLoose = match
      ? match
      : records.find((r) => {
          const urlAir = normalizeProfileUrl(r.get('URLPerfil') || '');
          const hasPdf = typeof r.get('URL_informePDF') === 'string' && r.get('URL_informePDF').startsWith('http');
          return hasPdf && (urlAir.startsWith(perfilNormalizado) || perfilNormalizado.startsWith(urlAir));
        });

    const foundRecord = match || matchLoose;

    if (!foundRecord) {
      console.log(`📝 No se encontró PDF para: ${email} | ${perfilNormalizado}`);
      return res.status(200).json({
        success: true,
        found: false,
        urlPDF: null,
        message: 'PDF aún no está disponible',
      });
    }

    let pdfUrl = foundRecord.get('URL_informePDF');

    // Convertir enlaces de Google Drive a formato previsualizable
    if (pdfUrl.includes('drive.google.com') && pdfUrl.includes('/file/d/')) {
      const idMatch = pdfUrl.match(/\/d\/([^/]+)\//);
      if (idMatch?.[1]) {
        pdfUrl = `https://drive.google.com/file/d/${idMatch[1]}/preview`;
      }
    }

    console.log(`✅ PDF encontrado: ${pdfUrl}`);

    return res.status(200).json({
      success: true,
      found: true,
      urlPDF: pdfUrl,
      recordId: foundRecord.id,
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
