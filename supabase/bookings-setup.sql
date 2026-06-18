-- ============================================================
-- 预订 + 排队 同步表 (Batch 7) — 在 Supabase SQL Editor 运行
-- 让桌位预订(reservations)和叫号排队(waitlist)能多设备实时同步(前台 + 经理)。
-- 不运行也能用,只是只存在本地、不跨设备。
--
-- ⚠️ 先运行 supabase/security-setup.sql(它定义 is_active()/my_kitchen()/is_super()
--    并锁好其它表)。本文件沿用同一套“按餐厅(kitchenId)隔离”的 RLS 模型,
--    而不是早期那种“任何登录用户都能读全部”的宽松策略。
-- ============================================================

create table if not exists public.reservations(
  id text primary key, data jsonb, updated_at timestamptz default now()
);
create table if not exists public.waitlist(
  id text primary key, data jsonb, updated_at timestamptz default now()
);

-- 外层闸门:撤销 anon 的一切权限;authenticated 可操作,具体行由 RLS 决定。
do $$
declare t text;
begin
  foreach t in array array['reservations','waitlist'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    -- 清掉可能存在的旧策略,避免 OR 叠加把门重新打开
    execute format('drop policy if exists %I on public.%I', t||'_auth_all', t);
    execute format('drop policy if exists %I on public.%I', t||'_tenant', t);
    -- 仅本餐厅、且账号 active 的人可读写;超管可见全部(与 security-setup.sql 一致)
    execute format($f$
      create policy %I on public.%I for all to authenticated
        using      ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) )
        with check ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) )
    $f$, t||'_tenant', t);
  end loop;
end $$;

do $$ begin alter publication supabase_realtime add table public.reservations; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.waitlist;     exception when duplicate_object then null; end $$;
