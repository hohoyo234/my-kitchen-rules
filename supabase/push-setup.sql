-- ============================================================
-- 后台推送(Web Push)后端配置 — 在 Supabase SQL Editor 运行
-- 前提:已部署 Edge Function "send-push" 并设好 VAPID 密钥
-- ============================================================

-- 1) 推送订阅表
create table if not exists public.push_subscriptions(
  endpoint   text primary key,
  p256dh     text,
  auth       text,
  staff_id   text,
  role       text,
  user_uid   uuid,
  created_at timestamptz default now()
);
alter table public.push_subscriptions enable row level security;
grant all on public.push_subscriptions to anon, authenticated;
drop policy if exists ps_all on public.push_subscriptions;
create policy ps_all on public.push_subscriptions
  for all to authenticated using (public.is_active()) with check (public.is_active());

-- 2) 定时任务:每分钟调用 send-push 的 cron 模式
--    需要扩展 pg_cron + pg_net;把 <SERVICE_ROLE_KEY> 换成你的 service_role 密钥
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('mkr-push', '* * * * *', $$
  select net.http_post(
    url     := 'https://gopluilwaltawempixeg.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer <SERVICE_ROLE_KEY>'),
    body    := jsonb_build_object('mode','cron')
  );
$$);

-- 如需取消定时任务: select cron.unschedule('mkr-push');
