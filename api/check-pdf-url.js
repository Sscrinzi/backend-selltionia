// api/check-pdf-url.js
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

export default async function handler(req, res) {
  // ✅ CORS mejorado: siempre antes de todo
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Manejar preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Solo permitir GET
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: 'Método no permitido. Solo GET es aceptado.'
    });
  }

  const { email, urlPerfil } = req.query;

  // Validación de parámetros
  if (!email || !urlPerfil) {
    return res.status(400).json({
      success: false,
      error: 'Faltan parámetros: email y urlPerfil son requeridos.',
    });
  }

  // Validación de variables de entorno
  const token = process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE_NAME;

  if (!token || !base || !table) {
    console.error('❌ Variables de entorno faltantes:', { 
      hasToken: !!token, 
      hasBase: !!base, 
      hasTable: !!table 
    });
    return res.status(500).json({
      success: false,
      error: 'Configuración del servidor incompleta',
    });
  }

  try {
    console.log(`🔍 Buscando PDF para email: ${email}, URL: ${urlPerfil}`);
    
    const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;

    const response = await axios.get(url, {
      headers: { 
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Selltion-Backend/1.0'
      },
      params: {
        filterByFormula: `{UsuarioEmail} = '${email}'`,
        pageSize: 10,
      },
      timeout: 15000 // 15 segundos timeout
    });

    const perfilActual = urlPerfil.split('?')[0]?.replace(/\/+$/, '');

    const matched = response.data.records.find((r) => {
      const perfilAirtable = r.fields?.URLPerfil?.split('?')[0]?.replace(/\/+$/, '');
      const hasValidPDF = r.fields?.URL_informePDF?.startsWith('http');
      
      return (
        r.fields?.UsuarioEmail === email &&
        perfilAirtable === perfilActual &&
        hasValidPDF
      );
    });

    if (!matched) {
      console.log(`📝 No se encontró PDF para: ${email} | ${perfilActual}`);
      return res.status(200).json({ 
        success: true, 
        found: false,
        message: 'PDF aún no está disponible'
      });
    }

    let pdfUrl = matched.fields.URL_informePDF;

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
      pdfURL: pdfUrl,
      recordId: matched.id
    });

  } catch (err) {
    console.error("❌ Error consultando Airtable:", err.message);
    
    // Manejo específico de errores
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      return res.status(503).json({
        success: false,
        error: 'Error de conectividad con Airtable',
        details: 'Servicio temporalmente no disponible'
      });
    }

    if (err.response?.status === 401) {
      return res.status(500).json({
        success: false,
        error: 'Error de autenticación con Airtable',
        details: 'Token inválido'
      });
    }

    if (err.response?.status === 429) {
      return res.status(429).json({
        success: false,
        error: 'Límite de solicitudes excedido',
        details: 'Intenta de nuevo en unos minutos'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? err.message : 'Error desconocido'
    });
  }
}
