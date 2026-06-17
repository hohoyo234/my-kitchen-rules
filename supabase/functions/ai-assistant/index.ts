// Supabase Edge Function: ai-assistant
// Proxies the in-app assistant's free-form questions to Claude. The API key
// lives ONLY here (as a Supabase secret) — never in the front-end.
//
// Deploy:
//   supabase functions deploy ai-assistant
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//
// The front-end (js/assistant.js → MKR.assistant.llm) POSTs { question, role, lang }.
// Returns { text }.

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
// Help-assistant model. Swap to "claude-haiku-4-5" for lower cost if desired.
const MODEL = Deno.env.get('ASSISTANT_MODEL') || 'claude-opus-4-8';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey' };
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// What the assistant knows about the product, so answers stay accurate + on-topic.
const APP_OVERVIEW = `My Kitchen Rules is an all-in-one restaurant management web app for small-to-mid restaurants, with four roles:
- Owner: Dashboard, Analytics, Daily report, Alerts, Audit log, Labor cost (+ owner-set award pay rates), Team, Branches (multi-venue overview & switch), Compliance, Customer feedback, Switch view, Settings (feature toggles + EN/中文 language). First-time owners do a setup wizard (logo + pick features).
- Manager: Smart Rostering (auto-roster from availability, student-visa hours hard-capped, drag to adjust, clickable stat cards), My shifts, Add Users, Menu & Items, Tasks, Swaps/SOS, POS, Kitchen Display (KDS), Table QR.
- Staff: My shifts (one-tap clock-in, drop a shift), Availability, Today's tasks, Swap market, My profile (own onboarding: passport/TFN/super/bank — staff can view their OWN details).
- Super Admin (hyy7010@gmail.com): reviews & approves new-restaurant applications; can switch into any venue.
Other features: POS cash count has an opening-float and a closing blind-drop mode (type counts or use ±); KDS serving/overdue time is configurable; tamper-proof audit log; bilingual EN/简体中文 via the EN|中 toggle. New restaurants apply from the login page; a Super Admin approves before the system is provisioned. Money is AUD; pay is an indicative Fair Work award estimate the employer confirms.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500);

  const p = await req.json().catch(() => ({} as any));
  const question = String(p.question || '').slice(0, 2000).trim();
  if (!question) return json({ error: 'empty question' }, 400);
  const role = ['owner', 'manager', 'staff', 'superadmin'].includes(p.role) ? p.role : 'a user';
  const lang = p.lang === 'zh' ? '简体中文' : 'English';

  const system = `You are the in-app help assistant for My Kitchen Rules. You are talking to a ${role}.
${APP_OVERVIEW}

Rules:
- Answer in ${lang}.
- Be concise and practical — usually 1-4 sentences. Use simple steps when explaining how to do something.
- Help with using the app and with general small-restaurant operations questions (rostering, compliance, cash handling, menus, staffing, marketing ideas).
- You do NOT have access to this venue's live data (revenue, specific staff, etc.). If asked for their own numbers, tell them which screen to open instead of inventing figures.
- This is an indicative tool, not legal/tax/financial advice; say so briefly when relevant.
- If a question is unrelated to the app or running a restaurant, answer briefly and steer back.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        system,
        messages: [{ role: 'user', content: question }],
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return json({ error: 'upstream', status: r.status, detail: detail.slice(0, 300) }, 502);
    }
    const data = await r.json();
    const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();
    return json({ text: text || "Sorry, I couldn't generate an answer." });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
