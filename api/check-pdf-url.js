import axios from 'axios';

export default async function handler(req, res) {
  const { email } = req.query;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const token = process.env.AIRTABLE_TOKEN;
  const base = process.env.AIRTABLE_BASE_ID;
  const table = process.env.AIRTABLE_TABLE_NAME;

  try {
    const response = await axios.get(
      `https://api.airtable.com/v0/${base}/${table}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: {
          filterByFormula: `{UsuarioEmail} = '${email}'`,
          maxRecords: 1
        }
      }
    );

    const record = response.data.records[0];
    if (record && record.fields.URL_informePDF) {
      res.status(200).json({ url: record.fields.URL_informePDF });
    } else {
      res.status(204).json({ url: null });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar Airtable', details: error.message });
  }
}
