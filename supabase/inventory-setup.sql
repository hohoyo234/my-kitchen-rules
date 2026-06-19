-- ============================================================
-- Inventory / stock sync table — run ONCE in Supabase SQL Editor.
-- One row per ingredient: id + data(jsonb {ing,name,qty,safety,unit,kitchenId}).
-- Per-tenant RLS so ACTIVE staff at the POS can deduct stock for their own
-- kitchen (app_meta would only let owner/manager write). Same model as the
-- other tables — run supabase/security-setup.sql first for is_active()/my_kitchen().
-- Without this table the app still works locally; it just won't sync to the cloud.
-- ============================================================
create table if not exists public.inventory(
  id text primary key, data jsonb, updated_at timestamptz default now()
);
revoke all on public.inventory from anon;
grant select, insert, update, delete on public.inventory to authenticated;
alter table public.inventory enable row level security;
alter table public.inventory force row level security;

drop policy if exists inventory_tenant on public.inventory;
create policy inventory_tenant on public.inventory for all to authenticated
  using      ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) )
  with check ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) );

do $$ begin alter publication supabase_realtime add table public.inventory;
exception when duplicate_object then null; end $$;
