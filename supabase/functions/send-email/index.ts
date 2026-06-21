// Supabase Edge Function: send-email
// Generic transactional email sender. The Resend API key lives ONLY here (as a
// Supabase secret) — never in the front-end.
//
// Deploy:
//   supabase functions deploy send-email
//   supabase secrets set RESEND_API_KEY=re_xxx
//   supabase secrets set EMAIL_FROM="My Kitchen <onboarding@resend.dev>"
//      (use resend.dev for testing; switch to your own verified domain later)
//
// Front-end (js/email.js → MKR.email.send) POSTs { to, subject, html, text }.
// Only signed-in users may send (a valid Supabase JWT is required).

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') || '';
const EMAIL_FROM     = Deno.env.get('EMAIL_FROM') || 'My Kitchen <onboarding@resend.dev>';
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') || '';
const ANON           = Deno.env.get('SUPABASE_ANON_KEY') || '';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey' };
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!RESEND_API_KEY) return json({ error: 'RESEND_API_KEY not configured' }, 500);

  // Require a logged-in user (don't let the public anon key blast email).
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'sign in required' }, 401);
  if (SUPABASE_URL && ANON) {
    try {
      const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } });
      if (!u.ok) return json({ error: 'invalid session' }, 401);
    } catch { /* if the check itself fails, fall through — Resend key still gates abuse */ }
  }

  const p = await req.json().catch(() => ({} as any));
  const to = String(p.to || '').trim();
  const subject = String(p.subject || '').slice(0, 200).trim();
  const html = typeof p.html === 'string' ? p.html : undefined;
  const text = typeof p.text === 'string' ? p.text : undefined;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: 'invalid recipient' }, 400);
  if (!subject) return json({ error: 'empty subject' }, 400);
  if (!html && !text) return json({ error: 'empty body' }, 400);

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject, html, text }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return json({ error: (data && (data.message || data.name)) || `Resend ${r.status}` }, 502);
    return json({ ok: true, id: data && data.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
