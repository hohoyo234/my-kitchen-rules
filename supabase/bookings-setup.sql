-- ============================================================
-- 预订 + 排队 同步表 (Batch 7) — 在 Supabase SQL Editor 运行
-- 让桌位预订(reservations)和叫号排队(waitlist)能多设备实时同步(前台 + 经理)。
-- 不运行也能用,只是只存在本地、不跨设备。结构同其它同步表:id + data(jsonb) + updated_at。
-- public.is_active() 来自 push-setup.sql(请先运行)。
-- ============================================================

create table if not exists public.reservations(
  id         text primary key,   -- {name,phone,partySize,date,time,note,status,kitchenId,...}
  data       jsonb,
  updated_at timestamptz default now()
);
alter table public.reservations enable row level security;
grant all on public.reservations to anon, authenticated;
drop policy if exists reservations_auth_all on public.reservations;
create policy reservations_auth_all on public.reservations
  for all to authenticated using (public.is_active()) with check (public.is_active());

create table if not exists public.waitlist(
  id         text primary key,   -- {num,name,phone,partySize,status,kitchenId,...}
  data       jsonb,
  updated_at timestamptz default now()
);
alter table public.waitlist enable row level security;
grant all on public.waitlist to anon, authenticated;
drop policy if exists waitlist_auth_all on public.waitlist;
create policy waitlist_auth_all on public.waitlist
  for all to authenticated using (public.is_active()) with check (public.is_active());

do $$ begin alter publication supabase_realtime add table public.reservations; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.waitlist;     exception when duplicate_object then null; end $$;
