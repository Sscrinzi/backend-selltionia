import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { nombre, apellido, linkedin_url } = req.body;

  const token = process.env.HUBSPOT_TOKEN;
  const url = "https://api.hubapi.com/crm/v3/objects/contacts";

  try {
    const response = await axios.post(url, {
      properties: {
        firstname: nombre,
        lastname: apellido,
        hs_linkedin_url: linkedin_url
      }
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    res.status(200).json({ success: true, id: response.data.id });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear contacto en HubSpot', details: error.message });
  }
}
