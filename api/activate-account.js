// /api/activate-account.js
// Vercel Function que crea o actualiza el auth user con email ya confirmado.
// Reemplaza al sb.auth.signUp() del cliente, evitando el flujo de email-confirm
// y los rate limits de Supabase. Usa el service_role para tener permisos de admin.
//
// Variables de entorno requeridas:
// - SUPABASE_URL: ej https://jcvizioahuqvmhwfnbop.supabase.co
// - SUPABASE_SERVICE_ROLE_KEY: service role key (secret, nunca exponer al cliente)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { type, id, token, password } = req.body || {};
  if (!type || !id || !token || !password) {
    return res.status(400).json({ error: 'Faltan campos: type, id, token, password' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }
  if (!['instructor', 'student'].includes(type)) {
    return res.status(400).json({ error: 'type debe ser instructor o student' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || 'https://jcvizioahuqvmhwfnbop.supabase.co';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY no configurada en Vercel' });
  }

  const headers = {
    'Authorization': `Bearer ${serviceKey}`,
    'apikey': serviceKey,
    'Content-Type': 'application/json',
  };

  const tokenColumn = type === 'instructor' ? 'activation_token' : 'consent_token';
  const tableName = type === 'instructor' ? 'instructors' : 'students';

  try {
    // 1. Validar token y obtener el registro
    const lookupUrl = `${supabaseUrl}/rest/v1/${tableName}?id=eq.${encodeURIComponent(id)}&${tokenColumn}=eq.${encodeURIComponent(token)}&select=id,email,first_name,last_name`;
    const lookupRes = await fetch(lookupUrl, { headers });
    if (!lookupRes.ok) {
      const t = await lookupRes.text();
      return res.status(500).json({ error: 'Error consultando registro', details: t });
    }
    const lookupData = await lookupRes.json();
    if (!Array.isArray(lookupData) || lookupData.length === 0) {
      return res.status(404).json({ error: 'Link inválido o ya usado' });
    }
    const record = lookupData[0];
    if (!record.email) {
      return res.status(400).json({ error: 'El registro no tiene email' });
    }

    // 2. Buscar si ya existe un auth user con ese email
    const findUrl = `${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(record.email)}`;
    const findRes = await fetch(findUrl, { headers });
    const findData = await findRes.json();
    let userId = null;

    if (findData?.users && findData.users.length > 0) {
      // Existe → actualizar password + confirmar email
      userId = findData.users[0].id;
      const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ password, email_confirm: true }),
      });
      if (!updateRes.ok) {
        const errTxt = await updateRes.text();
        return res.status(500).json({ error: 'Error actualizando auth user', details: errTxt });
      }
    } else {
      // No existe → crear con password y email confirmado
      const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: record.email,
          password,
          email_confirm: true,
        }),
      });
      if (!createRes.ok) {
        const errTxt = await createRes.text();
        return res.status(500).json({ error: 'Error creando auth user', details: errTxt });
      }
      const created = await createRes.json();
      userId = created.id || created.user?.id;
    }

    if (!userId) {
      return res.status(500).json({ error: 'No se pudo obtener el id del auth user' });
    }

    // 3. Actualizar el registro de instructor o student
    const updates = { auth_user_id: userId };
    if (type === 'instructor') {
      updates.status = 'active';
      updates.activated_at = new Date().toISOString();
      updates.activation_token = null;
    } else {
      updates.account_status = 'active';
      // El consent_signed lo marca el flujo de consent en activate.html ANTES de llegar acá.
      // No lo tocamos para no pisar el estado del consent_token (que ya quedó nulo al firmar).
    }

    const updRes = await fetch(`${supabaseUrl}/rest/v1/${tableName}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(updates),
    });
    if (!updRes.ok) {
      const errTxt = await updRes.text();
      return res.status(500).json({ error: 'Error actualizando registro de ' + type, details: errTxt });
    }

    return res.status(200).json({ success: true, userId });
  } catch (e) {
    return res.status(500).json({ error: 'Error interno', details: e.message });
  }
}
