-- ============================================================
-- Kitchens (venues / tenants) sync table — run in Supabase SQL Editor
-- Fixes the offline backlog: the app syncs every venue, branch and
-- restaurant application to public.kitchens, but the table never existed,
-- so those writes 404'd and piled up in the local outbox.
-- Same shape as the other synced tables: id + data(jsonb) + updated_at.
-- ============================================================

create table if not exists public.kitchens(
  id         text primary key,
  data       jsonb,
  updated_at timestamptz default now()
);

alter table public.kitchens enable row level security;
grant all on public.kitchens to anon, authenticated;

-- Active signed-in users (owner/manager/staff/superadmin) get full access.
-- public.is_active() is the same helper used by the other tables (see push-setup.sql).
drop policy if exists kitchens_auth_all on public.kitchens;
create policy kitchens_auth_all on public.kitchens
  for all to authenticated using (public.is_active()) with check (public.is_active());

-- Anyone may READ kitchens (login-page branding / public venue list — logos & names only).
drop policy if exists kitchens_anon_read on public.kitchens;
create policy kitchens_anon_read on public.kitchens
  for select to anon using (true);

-- The public login page submits a NEW restaurant application (status = 'pending').
-- Allow anon INSERT, but only of pending applications — they can't approve themselves.
drop policy if exists kitchens_anon_apply on public.kitchens;
create policy kitchens_anon_apply on public.kitchens
  for insert to anon with check ( (data->>'status') = 'pending' );

-- Live multi-device updates (other tables are already in this publication).
do $$ begin
  alter publication supabase_realtime add table public.kitchens;
exception when duplicate_object then null; end $$;

-- NOTE: push notifications need a second table — also run supabase/push-setup.sql
-- (public.push_subscriptions is likewise missing, which is why web-push storage 404s).
