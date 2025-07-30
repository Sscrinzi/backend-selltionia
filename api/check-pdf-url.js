import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

export default async function handler(req, res) {
  // ✅ CORS: siempre antes de todo
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end(); // preflight OK
  }

  const { email, urlPerfil } = req.query;

  if (!email || !urlPerfil) {
    return res.status(400).json({
      success: false,
      error: 'Faltan parámetros: email y urlPerfil son requeridos.',
    });
  }

  const token = process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE_NAME;

  if (!token || !base || !table) {
    return res.status(500).json({
      success: false,
      error: 'Faltan variables de entorno de Airtable',
    });
  }

  try {
    const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;

    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        filterByFormula: `{UsuarioEmail} = '${email}'`,
        pageSize: 10,
      },
    });

    const perfilActual = urlPerfil.split('?')[0]?.replace(/\/+$/, '');

    const matched = response.data.records.find((r) => {
      const perfilAirtable = r.fields?.URLPerfil?.split('?')[0]?.replace(/\/+$/, '');
      return (
        r.fields?.UsuarioEmail === email &&
        perfilAirtable === perfilActual &&
        r.fields?.URL_informePDF?.startsWith('http')
      );
    });

    if (!matched) {
      console.log("🔍 No se encontró coincidencia para", email, perfilActual);
      return res.status(200).json({ success: false, found: false });
    }

    let pdfUrl = matched.fields.URL_informePDF;

    if (pdfUrl.includes('drive.google.com') && pdfUrl.includes('/file/d/')) {
      const idMatch = pdfUrl.match(/\/d\/([^/]+)\//);
      if (idMatch?.[1]) {
        pdfUrl = `https://drive.google.com/file/d/${idMatch[1]}/preview`;
      }
    }

    return res.status(200).json({ success: true, found: true, pdfURL: pdfUrl });
  } catch (err) {
    console.error("❌ Error consultando Airtable:", err);
    return res.status(500).json({
      success: false,
      error: 'Error consultando Airtable',
      details: err.message,
    });
  }
}
