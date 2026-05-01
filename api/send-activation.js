// /api/send-activation.js
// Vercel Function para enviar emails de activación con Resend
// Variables de entorno requeridas:
// - RESEND_API_KEY: API key de Resend
// - EMAIL_FROM: dirección "from" (ej: noreply@fitstudioperu.com o noreply@onresend.com)
// - PUBLIC_URL: URL pública del sistema (ej: https://fitstudioperu.vercel.app)

export default async function handler(req, res) {
  // CORS para que la app pueda llamar
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, to, firstName, handle, activationLink, instructorId, studentId, consentLink } = req.body || {};

  if (!to || !type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const emailFrom = process.env.EMAIL_FROM || 'FIT Studio Peru <onboarding@resend.dev>';

  if (!apiKey) {
    return res.status(500).json({ error: 'RESEND_API_KEY not configured' });
  }

  let subject, html;

  if (type === 'instructor') {
    subject = '¡Bienvenido al equipo de FIT Studio Peru!';
    html = buildInstructorEmail({ firstName, handle, activationLink });
  } else if (type === 'student') {
    subject = 'Tu acceso a FIT Studio Peru';
    html = buildStudentEmail({ firstName, consentLink, activationLink });
  } else if (type === 'consent') {
    subject = 'Confirma tu inscripción en FIT Studio Peru';
    html = buildConsentEmail({ firstName, consentLink });
  } else {
    return res.status(400).json({ error: 'Invalid email type' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [to],
        subject: subject,
        html: html,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Resend error:', data);
      return res.status(response.status).json({ error: data.message || 'Email send failed', details: data });
    }

    return res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    console.error('Send error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// ============================================
// EMAIL TEMPLATES
// ============================================

const FIT_PURPLE = '#5B2A8F';
const FIT_PURPLE_DEEP = '#401D6B';
const FIT_LAVENDER = '#E8DFF5';
const FIT_PALE = '#F4EFFB';
const FIT_CREAM = '#FAF8F5';
const TEXT_DARK = '#2C2C2A';
const TEXT_GREY = '#5F5E5A';

function emailLayout(content, footerNote = '') {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0; padding:0; background-color:${FIT_CREAM}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${FIT_CREAM};">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden;">

          <!-- Header con logo -->
          <tr>
            <td align="center" style="padding:40px 30px 20px; background-color:${FIT_PURPLE};">
              <div style="width:60px; height:60px; background-color:#ffffff; border-radius:50%; display:inline-block; line-height:60px; color:${FIT_PURPLE}; font-size:18px; font-weight:700; letter-spacing:1px;">FIT</div>
              <div style="color:#ffffff; font-size:22px; margin-top:16px; font-weight:300; letter-spacing:0.5px;">Studio Peru</div>
              <div style="color:${FIT_LAVENDER}; font-size:11px; margin-top:4px; letter-spacing:2px; text-transform:uppercase;">Pilates Reformer</div>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:40px 40px 30px; color:${TEXT_DARK}; font-size:15px; line-height:1.7;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px; background-color:${FIT_PALE}; color:${TEXT_GREY}; font-size:12px; text-align:center; line-height:1.6;">
              ${footerNote ? `<div style="margin-bottom:12px;">${footerNote}</div>` : ''}
              <div style="font-weight:500; color:${FIT_PURPLE_DEEP};">FIT Studio Peru</div>
              <div>Santa Cruz · Inmaculado Corazón · San Antonio</div>
              <div>Miraflores, Lima — Perú</div>
              <div style="margin-top:12px; font-size:11px; color:${TEXT_GREY};">Si no esperabas este correo, puedes ignorarlo.</div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildInstructorEmail({ firstName, handle, activationLink }) {
  const greet = handle && handle !== firstName ? handle : firstName;
  const content = `
    <h1 style="font-size:26px; font-weight:400; color:${FIT_PURPLE_DEEP}; margin:0 0 20px; font-style:italic;">¡Bienvenido al equipo, ${escapeHtml(greet)}!</h1>

    <p style="margin:0 0 16px;">Estamos felices de tenerte como parte del equipo de profesores de FIT Studio Peru. Acabamos de crear tu cuenta en nuestro sistema de gestión.</p>

    <p style="margin:0 0 16px;">Para activar tu acceso y empezar a usar la plataforma, hacé click en el siguiente botón:</p>

    <div style="text-align:center; margin:32px 0;">
      <a href="${activationLink}" style="display:inline-block; background-color:${FIT_PURPLE}; color:#ffffff; text-decoration:none; padding:14px 32px; border-radius:999px; font-weight:500; font-size:15px;">Activar mi cuenta</a>
    </div>

    <div style="background-color:${FIT_PALE}; border-radius:8px; padding:18px; margin:24px 0;">
      <div style="font-weight:500; color:${FIT_PURPLE_DEEP}; margin-bottom:10px;">Lo que vas a poder hacer:</div>
      <ul style="margin:0; padding-left:20px; color:${TEXT_GREY};">
        <li style="margin-bottom:6px;">Ver todos tus turnos en las sedes asignadas</li>
        <li style="margin-bottom:6px;">Marcar asistencia de tus alumnos en tiempo real</li>
        <li style="margin-bottom:6px;">Confirmar tus turnos de fin de semana</li>
        <li style="margin-bottom:6px;">Consultar el detalle de cada clase</li>
      </ul>
    </div>

    <p style="margin:24px 0 0; font-size:13px; color:${TEXT_GREY};">Si el botón no funciona, copiá y pegá este link en tu navegador:<br/>
    <span style="word-break:break-all; color:${FIT_PURPLE};">${activationLink}</span></p>

    <p style="margin:24px 0 0;">Cualquier consulta, escribinos al WhatsApp del estudio. ¡Bienvenido!</p>
  `;
  return emailLayout(content, 'Este link es personal e intransferible. No lo compartas.');
}

function buildStudentEmail({ firstName, consentLink, activationLink }) {
  const link = consentLink || activationLink;
  const content = `
    <h1 style="font-size:26px; font-weight:400; color:${FIT_PURPLE_DEEP}; margin:0 0 20px; font-style:italic;">¡Bienvenido${firstName ? ', ' + escapeHtml(firstName) : ''}!</h1>

    <p style="margin:0 0 16px;">Acabamos de registrarte en FIT Studio Peru. Antes de tu primera clase, necesitamos que firmes nuestro consentimiento informado.</p>

    <p style="margin:0 0 16px;">Es un documento estándar para cualquier estudio de pilates profesional. Te toma 2 minutos leerlo y aceptarlo.</p>

    <div style="text-align:center; margin:32px 0;">
      <a href="${link}" style="display:inline-block; background-color:${FIT_PURPLE}; color:#ffffff; text-decoration:none; padding:14px 32px; border-radius:999px; font-weight:500; font-size:15px;">Firmar consentimiento</a>
    </div>

    <div style="background-color:${FIT_PALE}; border-radius:8px; padding:18px; margin:24px 0;">
      <div style="font-weight:500; color:${FIT_PURPLE_DEEP}; margin-bottom:10px;">Una vez firmado vas a poder:</div>
      <ul style="margin:0; padding-left:20px; color:${TEXT_GREY};">
        <li style="margin-bottom:6px;">Ver tus clases reservadas</li>
        <li style="margin-bottom:6px;">Consultar tu paquete activo y vencimiento</li>
        <li style="margin-bottom:6px;">Reagendar clases con anticipación</li>
        <li style="margin-bottom:6px;">Ver tus clases pendientes de recuperar</li>
      </ul>
    </div>

    <p style="margin:24px 0 0; font-size:13px; color:${TEXT_GREY};">Si el botón no funciona, copiá y pegá este link en tu navegador:<br/>
    <span style="word-break:break-all; color:${FIT_PURPLE};">${link}</span></p>

    <p style="margin:24px 0 0;">Nos vemos pronto en el estudio.</p>
  `;
  return emailLayout(content, 'Este link es personal. No lo compartas.');
}

function buildConsentEmail({ firstName, consentLink }) {
  return buildStudentEmail({ firstName, consentLink });
}

function escapeHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
