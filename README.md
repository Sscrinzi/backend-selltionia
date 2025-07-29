# Selltion Backend

Este backend contiene endpoints seguros para:

- Enviar datos a HubSpot sin exponer el token
- Consultar si ya se generó el informe PDF en Airtable

## Endpoints disponibles

- POST `/api/send-to-hubspot`
- GET `/api/check-pdf-url?email=ejemplo@correo.com`

## Configuración

Agregar en Vercel las siguientes variables de entorno:

- `HUBSPOT_TOKEN`: Tu token privado de HubSpot
- `AIRTABLE_TOKEN`: Tu token de Airtable
- `AIRTABLE_BASE_ID`: ID de la base donde se guarda el informe
- `AIRTABLE_TABLE_NAME`: Nombre de la tabla

## Deploy

1. Subir esta carpeta a un repositorio de GitHub
2. Conectarlo en [vercel.com](https://vercel.com)
3. Añadir las variables de entorno en el proyecto
4. ¡Listo!
