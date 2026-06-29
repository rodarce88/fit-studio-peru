// /api/alumna-auth.js
// Canjea el app_token (de students.app_token) por una sesión de Supabase.
// NO necesita dependencias npm: usa fetch nativo (Node 18+).
// La service_role key vive SOLO aquí, vía variable de entorno en Vercel:
//   SUPABASE_SERVICE_ROLE_KEY = <service_role secret de Supabase>  (ya existe en tu proyecto)

const SUPABASE_URL = 'https://jcvizioahuqvmhwfnbop.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function sbFetch(path, opts = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  if (!SERVICE_KEY) return res.status(500).json({ error: 'server_misconfigured' });

  let token = '';
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    token = (body.token || '').trim();
  } catch (_) { token = ''; }
  if (!token || token.length < 20) return res.status(400).json({ error: 'bad_token' });

  try {
    // 1) Identificar a la alumna por su app_token (service role: ignora RLS)
    const sr = await sbFetch(
      `/rest/v1/students?app_token=eq.${encodeURIComponent(token)}&select=id,first_name,auth_user_id,student_status`
    );
    const rows = await sr.json();
    const stud = Array.isArray(rows) ? rows[0] : null;
    if (!stud || stud.student_status !== 'active') return res.status(401).json({ error: 'invalid_token' });

    const email = `alumna-${stud.id}@students.fitstudioperu.com`;

    // 2) Asegurar el usuario de auth (si no existe; ignora "ya existe")
    if (!stud.auth_user_id) {
      await sbFetch('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email,
          email_confirm: true,
          user_metadata: { student_id: stud.id, role: 'student' },
        }),
      });
    }

    // 3) Generar enlace mágico (devuelve también el usuario)
    const gr = await sbFetch('/auth/v1/admin/generate_link', {
      method: 'POST',
      body: JSON.stringify({ type: 'magiclink', email }),
    });
    const gl = await gr.json();
    if (!gr.ok) return res.status(500).json({ error: 'link_failed', detail: gl });

    const userId = gl.id || (gl.user && gl.user.id);
    const tokenHash = gl.hashed_token || (gl.properties && gl.properties.hashed_token);
    const emailOtp = gl.email_otp || (gl.properties && gl.properties.email_otp);

    // 4) Vincular auth_user_id si aún no estaba
    if (!stud.auth_user_id && userId) {
      await sbFetch(`/rest/v1/students?id=eq.${stud.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ auth_user_id: userId }),
      });
    }

    return res.status(200).json({
      ok: true,
      first_name: stud.first_name,
      email,
      token_hash: tokenHash,
      email_otp: emailOtp,
    });
  } catch (e) {
    return res.status(500).json({ error: 'unexpected', detail: String((e && e.message) || e) });
  }
};
