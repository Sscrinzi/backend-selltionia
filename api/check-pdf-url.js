import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';

export default async function handler(req, res) {
  const { email } = req.query;
  const token = process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE_NAME;

  if (!email) {
    return res.status(400).json({ error: 'Email is required in query string' });
  }
  if (!token || !base || !table) {
    return res.status(500).json({ error: 'Missing Airtable configuration variables' });
  }

  try {
    const url = `https://api.airtable.com/v0/${base}/${encodeURIComponent(table)}`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      params: {
        filterByFormula: `{UsuarioEmail} = '${email}'`,
        maxRecords: 1
      }
    });

    const record = response.data.records[0];

    if (!record) {
      return res.status(404).json({ error: 'No record found with that email' });
    }

    const pdfUrl = record.fields.URL_informePDF || null;

    return res.status(200).json({ url: pdfUrl });

  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.error?.message || error.message;
    return res.status(status).json({ error: 'Error al consultar Airtable', details: message });
  }
}
