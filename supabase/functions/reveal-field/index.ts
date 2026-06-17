// Supabase Edge Function: reveal-field
// ISSUE #4 — production-grade handling of sensitive fields (TFN / passport).
// The encryption key lives ONLY here (a function secret / Supabase Vault) and
// never reaches the browser, so the key and the ciphertext are NOT co-located.
//
// The function verifies the CALLER from their JWT (not from anything the client
// claims) and only encrypts/decrypts when the caller is the super admin, the
// OWNER of that staff member's kitchen, or the staff member themselves.
//
// Deploy:
//   supabase functions deploy reveal-field
//   supabase secrets set FIELD_KEY=$(openssl rand -base64 32)   # 32-byte AES key
//   # SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Front-end usage (swap MKR.crypto.enc/dec to call this):
//   POST { action:'encrypt'|'decrypt', value, userId }  with the user's access
//   token in the Authorization: Bearer <token> header. Returns { value }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey' };
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const FIELD_KEY_B64 = Deno.env.get('FIELD_KEY') || '';

async function aesKey(): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(FIELD_KEY_B64), c => c.charCodeAt(0));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function enc(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(), new TextEncoder().encode(plain)));
  const buf = new Uint8Array(iv.length + ct.length); buf.set(iv); buf.set(ct, iv.length);
  return 'aes:' + btoa(String.fromCharCode(...buf));
}
async function dec(blob: string): Promise<string> {
  const buf = Uint8Array.from(atob(blob.replace(/^aes:/, '')), c => c.charCodeAt(0));
  const iv = buf.slice(0, 12), ct = buf.slice(12);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await aesKey(), ct));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!FIELD_KEY_B64) return json({ error: 'FIELD_KEY not configured' }, 500);

  // 1) Identify the caller from their JWT (trusted) — NOT from the request body.
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'missing auth' }, 401);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
  const { data: u } = await admin.auth.getUser(token);
  if (!u || !u.user) return json({ error: 'invalid token' }, 401);

  const { data: meRows } = await admin.from('profiles').select('role,kitchen_id,staff_id,active').eq('id', u.user.id).limit(1);
  const me = meRows && meRows[0];
  if (!me || me.active === false) return json({ error: 'no active profile' }, 403);

  const body = await req.json().catch(() => ({} as any));
  const action = body.action, value = String(body.value ?? ''), userId = String(body.userId ?? '');
  if (action !== 'encrypt' && action !== 'decrypt') return json({ error: 'bad action' }, 400);

  // 2) Authorise: super admin, the staff member themselves, or the OWNER of the
  //    kitchen that staff member belongs to.
  let allowed = me.role === 'superadmin' || me.staff_id === userId;
  if (!allowed && me.role === 'owner') {
    const { data: staffRows } = await admin.from('users').select('data').eq('id', userId).limit(1);
    const staffKitchen = staffRows && staffRows[0] && (staffRows[0].data as any)?.kitchenId;
    allowed = staffKitchen && staffKitchen === me.kitchen_id;
  }
  if (!allowed) return json({ error: 'forbidden' }, 403);

  // 3) Do the crypto server-side; the key never leaves this function.
  try {
    return json({ value: action === 'encrypt' ? await enc(value) : await dec(value) });
  } catch (_e) {
    return json({ error: 'crypto failed' }, 400);
  }
});
