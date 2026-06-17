-- ============================================================
-- Membership sync tables (Batch 4) — run in Supabase SQL Editor
-- The app syncs loyalty members and e-coupons to the cloud the same way
-- it syncs every other entity. Without these tables those writes 404 and
-- pile up in the local outbox (exactly the backlog the kitchens table caused).
-- Same shape as the other synced tables: id + data(jsonb) + updated_at.
-- public.is_active() is the shared helper defined in push-setup.sql — run that first.
-- ============================================================

-- ---- Members: loyalty points + stored value ----
create table if not exists public.members(
  id         text primary key,   -- member code (also the QR payload), e.g. MAB12CD
  data       jsonb,              -- {phone,name,points,balance,visits,spent,history,kitchenId,...}
  updated_at timestamptz default now()
);

alter table public.members enable row level security;
grant all on public.members to anon, authenticated;

-- Active signed-in staff/managers/owners have full access (created/looked up at the POS).
drop policy if exists members_auth_all on public.members;
create policy members_auth_all on public.members
  for all to authenticated using (public.is_active()) with check (public.is_active());

-- ---- Coupons: public or member-specific e-coupons ----
create table if not exists public.coupons(
  id         text primary key,
  data       jsonb,              -- {code,type,value,minSpend,expiry,memberId,used,kitchenId,...}
  updated_at timestamptz default now()
);

alter table public.coupons enable row level security;
grant all on public.coupons to anon, authenticated;

drop policy if exists coupons_auth_all on public.coupons;
create policy coupons_auth_all on public.coupons
  for all to authenticated using (public.is_active()) with check (public.is_active());

-- Live multi-device updates (top-ups / point changes / coupon redemptions).
do $$ begin
  alter publication supabase_realtime add table public.members;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.coupons;
exception when duplicate_object then null; end $$;

-- NOTE: also run supabase/kitchens-setup.sql and supabase/push-setup.sql if you
-- haven't — those tables are likewise required for full cloud sync.
