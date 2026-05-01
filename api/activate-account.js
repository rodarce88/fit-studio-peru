// /api/activate-account.js
// Vercel Function — crea o actualiza el auth user con email confirmado.
// Estrategia: intenta CREAR primero. Si existe, busca paginando y actualiza.
//
// Variables de entorno requeridas:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY (secret, NUNCA exponer al cliente)

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
    // 1. Validar token y obtener registro
    const lookupUrl = `${supabaseUrl}/rest/v1/${tableName}?id=eq.${encodeURIComponent(id)}&${tokenColumn}=eq.${encodeURIComponent(token)}&select=id,email`;
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
    const targetEmail = record.email.toLowerCase().trim();

    let userId = null;
    let action = 'none';
    let createErrorBody = null;

    // 2. Intentar CREAR usuario primero
    const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email: targetEmail,
        password,
        email_confirm: true,
      }),
    });

    if (createRes.ok) {
      const created = await createRes.json();
      userId = created.id || created.user?.id;
      action = 'created';
    } else {
      // Posiblemente ya existe. Capturar error para debug.
      createErrorBody = await createRes.text();

      // 3. Buscar usuario existente paginando (no confiar en filtros del query)
      let existingUser = null;
      for (let page = 1; page <= 20; page++) {
        const listUrl = `${supabaseUrl}/auth/v1/admin/users?page=${page}&per_page=1000`;
        const listRes = await fetch(listUrl, { headers });
        if (!listRes.ok) {
          const t = await listRes.text();
          return res.status(500).json({
            error: 'Error listando usuarios',
            details: t,
            createError: createErrorBody,
          });
        }
        const listData = await listRes.json();
        const users = Array.isArray(listData) ? listData : (listData?.users || []);
        const match = users.find(u => u.email && u.email.toLowerCase().trim() === targetEmail);
        if (match) { existingUser = match; break; }
        if (users.length < 1000) break;
      }

      if (!existingUser) {
        return res.status(500).json({
          error: 'Create falló y el usuario no se encontró tampoco',
          createError: createErrorBody,
        });
      }

      userId = existingUser.id;

      // 4. Actualizar password + confirmar email del usuario existente
      const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${userId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          password,
          email_confirm: true,
        }),
      });

      if (!updateRes.ok) {
        const t = await updateRes.text();
        return res.status(500).json({
          error: 'Error actualizando usuario existente',
          details: t,
          userId,
        });
      }
      action = 'updated';
    }

    if (!userId) {
      return res.status(500).json({ error: 'No se obtuvo userId tras crear/actualizar' });
    }

    // 5. Actualizar registro en instructors/students con auth_user_id
    const updates = { auth_user_id: userId };
    if (type === 'instructor') {
      updates.status = 'active';
      updates.activated_at = new Date().toISOString();
      updates.activation_token = null;
    } else {
      updates.account_status = 'active';
    }

    const updRes = await fetch(`${supabaseUrl}/rest/v1/${tableName}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(updates),
    });
    if (!updRes.ok) {
      const t = await updRes.text();
      return res.status(500).json({
        error: 'Auth user creado/actualizado pero falló update del registro de ' + type,
        details: t,
        userId,
      });
    }

    return res.status(200).json({
      success: true,
      userId,
      action,
      email: targetEmail,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Error interno', details: e.message });
  }
}
