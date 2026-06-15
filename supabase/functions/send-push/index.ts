// Supabase Edge Function: send-push
// 两种模式:
//   direct — 客户端在事件发生时调用(如发 SOS / 红色警报),立刻推送给目标角色/员工
//   cron   — pg_cron 每分钟调用,扫描"上班前 1 小时催班 + 最近红色警报",关 App 也能收
// 需在 Supabase 设置密钥:VAPID_PUBLIC, VAPID_PRIVATE (SUPABASE_URL/SERVICE_ROLE_KEY 自动注入)
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC')  || '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE') || '';
webpush.setVapidDetails('mailto:owner@mykitchen.app', VAPID_PUBLIC, VAPID_PRIVATE);

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type' };
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function sendTo(subs: any[], title: string, body: string, tag?: string) {
  let ok = 0;
  for (const s of subs || []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title, body, tag })
      );
      ok++;
    } catch (e: any) {
      // 订阅失效 → 清理
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      }
    }
  }
  return ok;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const p = await req.json().catch(() => ({}));

  // ---- 事件即时推送 ----
  if (p.mode === 'direct') {
    let q = supabase.from('push_subscriptions').select('*');
    if (p.target?.role) q = q.eq('role', p.target.role);
    if (p.target?.staff_id) q = q.eq('staff_id', p.target.staff_id);
    const { data } = await q;
    const sent = await sendTo(data || [], p.title || 'My Kitchen', p.body || '', p.tag);
    return json({ sent });
  }

  // ---- 定时扫描(pg_cron 每分钟)----
  if (p.mode === 'cron') {
    const now = new Date();
    const dayIdx = (now.getDay() + 6) % 7;                 // 周一=0
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const today = now.toISOString().slice(0, 10);
    let pushed = 0;

    // 1) 上班前约 1 小时催班
    const { data: shifts } = await supabase.from('shifts').select('*');
    for (const row of shifts || []) {
      const s = row.data; if (!s || s.day !== dayIdx || !s.start) continue;
      const [h, m] = String(s.start).split(':').map(Number);
      const diff = (h * 60 + m) - nowMin;
      if (diff >= 55 && diff <= 65 && s.pushReminded !== today) {
        const { data: subs } = await supabase.from('push_subscriptions').select('*').eq('staff_id', s.staffId);
        pushed += await sendTo(subs || [], '⏰ 上班提醒', `你 ${s.start} 的班约 1 小时后开始`, 'rem');
        s.pushReminded = today;
        await supabase.from('shifts').update({ data: s }).eq('id', row.id);
      }
    }

    // 2) 最近 5 分钟的未读红色/异常警报 → 推老板
    const { data: owners } = await supabase.from('push_subscriptions').select('*').eq('role', 'owner');
    const { data: alerts } = await supabase.from('alerts').select('*');
    for (const row of alerts || []) {
      const a = row.data; if (!a || a.read || a.pushed) continue;
      if (Date.now() - (a.ts || 0) < 5 * 60000) {
        pushed += await sendTo(owners || [], (a.level === 'red' ? '🚨 ' : '🔔 ') + (a.title || '警报'), a.desc || '', 'al');
        a.pushed = true;
        await supabase.from('alerts').update({ data: a }).eq('id', row.id);
      }
    }

    return json({ pushed });
  }

  return json({ error: 'unknown mode' }, 400);
});
