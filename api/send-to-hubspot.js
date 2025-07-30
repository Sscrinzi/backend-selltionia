import axios from 'axios';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usar POST.' });
  }

  const { access_token, nombre, apellido, linkedin_url } = req.body;

  if (!access_token || !nombre || !apellido || !linkedin_url) {
    return res.status(400).json({ error: 'Faltan campos obligatorios: access_token, nombre, apellido, linkedin_url' });
  }

  try {
    const response = await axios.post('https://api.hubapi.com/crm/v3/objects/contacts', {
      properties: {
        firstname: nombre,
        lastname: apellido,
        website: linkedin_url
      }
    }, {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });

    return res.status(200).json({ success: true, contactId: response.data.id });

  } catch (error) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.message;
    return res.status(status).json({ error: 'Error al crear contacto en HubSpot', details: message });
  }
}
