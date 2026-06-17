-- ============================================================================
-- MY KITCHEN RULES — MASTER SECURITY GATE  (run ONCE in Supabase SQL Editor)
-- ============================================================================
-- This is the file that was MISSING from the project (issue #5). Every other
-- *.sql here only *referenced* public.is_active() — it was never defined, and
-- the core tables (users/orders/onboarding/audit/...) had no policies in the
-- repo at all. That means "who is allowed to read the database" lived only in
-- the live project and could not be audited or reproduced from the code.
--
-- WHAT THIS DOES — in one sentence:
--   The DATABASE (not the browser) decides who can read/write what, based on the
--   logged-in user's real identity (auth.uid()) and their server-side role.
--   So even if an attacker edits their browser to claim role:"owner", or holds
--   the public anon key, Postgres still refuses to hand over data that isn't
--   theirs. This is what makes issues #1 and #4 harmless at the data layer.
--
-- IT IS SAFE / IDEMPOTENT: re-running it just re-applies the same policies.
-- IT IS A CUTOVER: once RLS is on, the app MUST authenticate via Supabase Auth
--   and every real user MUST have a row in public.profiles. See SECURITY.md.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) Tables (id + data jsonb + updated_at is the shape the app already uses).
--    create-if-not-exists so this file is self-contained and won't clobber data.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'kitchens','users','menu','orders','shifts','tasks','swaps','sos','alerts',
    'reconciliations','clockins','onboarding','audit','customer_feedback','members','coupons'
  ] loop
    execute format(
      'create table if not exists public.%I (id text primary key, data jsonb, updated_at timestamptz default now())', t);
  end loop;
end $$;

create table if not exists public.app_meta (key text primary key, value jsonb);

-- profiles: the SERVER-SIDE source of truth for identity & role.
-- id = auth.uid(). role/kitchen_id/staff_id/active are set ONLY by an owner or
-- the super admin (see policies below) — a user can never promote themselves.
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text,
  name       text,
  role       text not null default 'staff' check (role in ('superadmin','owner','manager','staff')),
  staff_id   text,                       -- the app's business id, e.g. u_amy (sess.id)
  kitchen_id text,                        -- tenant this user belongs to, e.g. k_main
  emoji      text,
  active     boolean not null default true,
  created_at timestamptz default now()
);

-- A profiles table may ALREADY exist from an earlier partial setup and be missing
-- newer columns (e.g. kitchen_id). `create table if not exists` above won't add
-- them, so patch the columns the policies below depend on. Harmless if present.
alter table public.profiles add column if not exists username   text;
alter table public.profiles add column if not exists name       text;
alter table public.profiles add column if not exists role       text;
alter table public.profiles add column if not exists staff_id   text;
alter table public.profiles add column if not exists kitchen_id text;
alter table public.profiles add column if not exists emoji      text;
alter table public.profiles add column if not exists active     boolean not null default true;
alter table public.profiles add column if not exists created_at timestamptz default now();
-- An older setup may have a role check constraint WITHOUT 'superadmin', which
-- blocks creating the super admin. Replace it with the full allowed set.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('superadmin','owner','manager','staff'));
-- Existing demo profiles had no kitchen → default them to the demo venue so they
-- keep seeing their data. (The super admin bypasses kitchen scoping anyway.)
update public.profiles set kitchen_id = 'k_main'
  where kitchen_id is null and coalesce(role,'') <> 'superadmin';

-- ----------------------------------------------------------------------------
-- 1) Helper functions (SECURITY DEFINER so they can read profiles regardless of
--    the caller's own RLS). Fixed search_path = anti-hijack hardening.
-- ----------------------------------------------------------------------------
create or replace function public.my_role() returns text
  language sql stable security definer set search_path = public, pg_temp as
$$ select role from public.profiles where id = auth.uid() and active $$;

create or replace function public.my_kitchen() returns text
  language sql stable security definer set search_path = public, pg_temp as
$$ select kitchen_id from public.profiles where id = auth.uid() and active $$;

create or replace function public.my_staff_id() returns text
  language sql stable security definer set search_path = public, pg_temp as
$$ select staff_id from public.profiles where id = auth.uid() and active $$;

create or replace function public.is_active() returns boolean
  language sql stable security definer set search_path = public, pg_temp as
$$ select exists (select 1 from public.profiles where id = auth.uid() and active) $$;

create or replace function public.is_super() returns boolean
  language sql stable security definer set search_path = public, pg_temp as
$$ select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'superadmin') $$;

-- Only signed-in users' queries invoke these (the anon policies never call them),
-- so revoke the default PUBLIC/anon execute and grant to authenticated only.
-- (Clears the "Public Can Execute SECURITY DEFINER Function" advisor warnings.)
revoke execute on function public.my_role(), public.my_kitchen(), public.my_staff_id(),
                           public.is_active(), public.is_super() from public, anon;
grant  execute on function public.my_role(), public.my_kitchen(), public.my_staff_id(),
                           public.is_active(), public.is_super() to authenticated;

-- ----------------------------------------------------------------------------
-- 2) Least-privilege table grants. RLS is the inner gate, grants are the outer
--    one — we tighten BOTH. (Earlier *.sql ran `grant all ... to anon`, which
--    is far too broad; we revoke that here.)
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'kitchens','users','menu','orders','shifts','tasks','swaps','sos','alerts',
    'reconciliations','clockins','onboarding','audit','customer_feedback',
    'members','coupons','profiles','app_meta'
  ] loop
    execute format('revoke all on public.%I from anon', t);
    -- authenticated may touch every table; RLS decides which rows.
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- Minimal anonymous (logged-out customer / login page) grants — and nothing else.
grant select on public.menu, public.kitchens, public.app_meta to anon;   -- view menu + login branding
grant insert on public.orders, public.kitchens, public.customer_feedback to anon; -- place order / apply / leave feedback

-- ----------------------------------------------------------------------------
-- 2.5) WIPE every pre-existing policy on these tables first. RLS policies are
--      OR-combined, so a leftover permissive policy (e.g. an old `to anon
--      using(true)`) from an earlier setup would keep the door open even after
--      we add the strict ones below. Start from a clean slate.
-- ----------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname='public' and tablename = any(array[
      'kitchens','users','menu','orders','shifts','tasks','swaps','sos','alerts',
      'reconciliations','clockins','onboarding','audit','customer_feedback',
      'members','coupons','profiles','app_meta'])
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 3) Generic per-tenant tables: an ACTIVE signed-in user may touch only rows
--    belonging to THEIR kitchen; the super admin sees everything.
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'shifts','tasks','swaps','sos','alerts','reconciliations','clockins','members','coupons'
  ] loop
    execute format('drop policy if exists %I on public.%I', t||'_tenant', t);
    execute format($f$
      create policy %I on public.%I for all to authenticated
        using      ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) )
        with check ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) )
    $f$, t||'_tenant', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- 4) KITCHENS — public branding read + public "apply" insert; owner manages own.
-- ----------------------------------------------------------------------------
drop policy if exists kitchens_anon_read  on public.kitchens;
drop policy if exists kitchens_anon_apply on public.kitchens;
drop policy if exists kitchens_auth_read  on public.kitchens;
drop policy if exists kitchens_owner_write on public.kitchens;

create policy kitchens_anon_read on public.kitchens
  for select to anon using (true);                     -- logos / names on the login page
create policy kitchens_anon_apply on public.kitchens
  for insert to anon with check ((data->>'status') = 'pending');  -- new-restaurant application only
create policy kitchens_auth_read on public.kitchens
  for select to authenticated using (true);
create policy kitchens_owner_write on public.kitchens
  for all to authenticated
    using      ( public.is_super() or (public.my_role()='owner' and id = public.my_kitchen()) )
    with check ( public.is_super() or (public.my_role()='owner' and id = public.my_kitchen()) );

-- ----------------------------------------------------------------------------
-- 5) MENU — customers read it; owner/manager of the kitchen edit it.
-- ----------------------------------------------------------------------------
drop policy if exists menu_anon_read on public.menu;
drop policy if exists menu_read on public.menu;
drop policy if exists menu_write on public.menu;

create policy menu_anon_read on public.menu for select to anon using (true);
create policy menu_read on public.menu for select to authenticated
  using ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) );
create policy menu_write on public.menu for all to authenticated
  using      ( public.is_super() or (public.my_role() in ('owner','manager') and (data->>'kitchenId') = public.my_kitchen()) )
  with check ( public.is_super() or (public.my_role() in ('owner','manager') and (data->>'kitchenId') = public.my_kitchen()) );

-- ----------------------------------------------------------------------------
-- 6) ORDERS — a logged-out customer may INSERT (QR ordering) but never SELECT
--    others' orders; staff of the kitchen manage them.
-- ----------------------------------------------------------------------------
drop policy if exists orders_anon_insert on public.orders;
drop policy if exists orders_tenant on public.orders;

create policy orders_anon_insert on public.orders for insert to anon with check (true);
create policy orders_tenant on public.orders for all to authenticated
  using      ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) )
  with check ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) );

-- ----------------------------------------------------------------------------
-- 7) CUSTOMER FEEDBACK — anon may leave it; the kitchen reads its own.
-- ----------------------------------------------------------------------------
drop policy if exists cf_anon_insert on public.customer_feedback;
drop policy if exists cf_tenant on public.customer_feedback;

create policy cf_anon_insert on public.customer_feedback for insert to anon with check (true);
create policy cf_tenant on public.customer_feedback for all to authenticated
  using      ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) )
  with check ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) );

-- ----------------------------------------------------------------------------
-- 8) USERS — same-kitchen visibility. Owner/manager edit the team; a person may
--    edit their OWN row. (NOTE: users.data.role is display-only — real authority
--    comes from profiles.role, which staff cannot write. So self-editing users
--    can never escalate privileges.)
-- ----------------------------------------------------------------------------
drop policy if exists users_read on public.users;
drop policy if exists users_write on public.users;
drop policy if exists users_self on public.users;

create policy users_read on public.users for select to authenticated
  using ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) );
create policy users_write on public.users for all to authenticated
  using      ( public.is_super() or (public.my_role() in ('owner','manager') and (data->>'kitchenId') = public.my_kitchen()) )
  with check ( public.is_super() or (public.my_role() in ('owner','manager') and (data->>'kitchenId') = public.my_kitchen()) );
create policy users_self on public.users for update to authenticated
  using ( id = public.my_staff_id() ) with check ( id = public.my_staff_id() );

-- ----------------------------------------------------------------------------
-- 9) ONBOARDING (TFN / passport / bank) — the real fix for issue #4.
--    Readable/writable ONLY by the staff member themselves OR the OWNER of the
--    kitchen that staff member belongs to (joined via public.users). Managers
--    and other staff cannot see it; the super admin can (audited in-app).
-- ----------------------------------------------------------------------------
drop policy if exists onboarding_self on public.onboarding;
drop policy if exists onboarding_owner on public.onboarding;

create policy onboarding_self on public.onboarding for all to authenticated
  using      ( (data->>'userId') = public.my_staff_id() )
  with check ( (data->>'userId') = public.my_staff_id() );

create policy onboarding_owner on public.onboarding for all to authenticated
  using (
    public.is_super() or (
      public.my_role() = 'owner' and exists (
        select 1 from public.users u
        where u.id = (onboarding.data->>'userId')
          and (u.data->>'kitchenId') = public.my_kitchen()
      )
    )
  )
  with check (
    public.is_super() or (
      public.my_role() = 'owner' and exists (
        select 1 from public.users u
        where u.id = (onboarding.data->>'userId')
          and (u.data->>'kitchenId') = public.my_kitchen()
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 10) AUDIT — append-only & immutable. Anyone active may INSERT; only the owner
--     / super admin may READ. NO update/delete policy exists, so with RLS forced
--     ON the rows can never be changed or deleted (matches the in-app guarantee).
-- ----------------------------------------------------------------------------
drop policy if exists audit_insert on public.audit;
drop policy if exists audit_read on public.audit;

create policy audit_insert on public.audit for insert to authenticated
  with check ( public.is_active() );
create policy audit_read on public.audit for select to authenticated
  using ( public.is_super() or public.my_role() = 'owner' );

-- ----------------------------------------------------------------------------
-- 11) PROFILES — identity table. A user reads their own; owner/manager read
--     their team; super reads all. ONLY owner/super may write, and NOBODY may
--     mint a superadmin from here (that is done once, manually, in step 13).
--     This is what stops self-promotion (issue #1).
-- ----------------------------------------------------------------------------
drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_write on public.profiles;

create policy profiles_read on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or public.is_super()
    or (public.my_role() in ('owner','manager') and kitchen_id = public.my_kitchen())
  );
create policy profiles_write on public.profiles for all to authenticated
  using (
    public.is_super()
    or ( public.my_role()='owner'   and kitchen_id = public.my_kitchen() )
    or ( public.my_role()='manager' and kitchen_id = public.my_kitchen() and role = 'staff' )
  )
  with check (
    public.is_super()
    or ( public.my_role()='owner'   and kitchen_id = public.my_kitchen() and role in ('owner','manager','staff') )
    or ( public.my_role()='manager' and kitchen_id = public.my_kitchen() and role = 'staff' )
  );

-- ----------------------------------------------------------------------------
-- 12) APP_META — settings/brand. Login page (anon) may read ONLY 'brand';
--     active staff read settings; owner/manager/super write.
-- ----------------------------------------------------------------------------
drop policy if exists app_meta_anon_brand on public.app_meta;
drop policy if exists app_meta_read on public.app_meta;
drop policy if exists app_meta_write on public.app_meta;

create policy app_meta_anon_brand on public.app_meta for select to anon using ( key = 'brand' );
create policy app_meta_read on public.app_meta for select to authenticated using ( public.is_active() );
create policy app_meta_write on public.app_meta for all to authenticated
  using      ( public.is_super() or public.my_role() in ('owner','manager') )
  with check ( public.is_super() or public.my_role() in ('owner','manager') );

-- ----------------------------------------------------------------------------
-- 13) BOOTSTRAP THE SUPER ADMIN (replaces the hard-coded admin1234 — issue #3).
--     a) In the Supabase dashboard create an Auth user for hyy7010@gmail.com
--        with a STRONG password (Authentication → Users → Add user).
--     b) Then run the statement below to grant that account the superadmin role.
--        After this, the super admin signs in with that real password; there is
--        no password constant anywhere in the code.
-- ----------------------------------------------------------------------------
-- insert into public.profiles (id, username, name, role, staff_id, active)
-- select id, 'superadmin', 'Super Admin', 'superadmin', 'u_super', true
--   from auth.users where email = 'hyy7010@gmail.com'
-- on conflict (id) do update set role='superadmin', active=true;

-- ----------------------------------------------------------------------------
-- 14) VERIFY (run these after; eyeball the output).
-- ----------------------------------------------------------------------------
-- Every app table should show rowsecurity = true:
--   select relname, relrowsecurity, relforcerowsecurity
--     from pg_class where relnamespace = 'public'::regnamespace and relkind='r'
--     order by relname;
-- List every policy so you can confirm anon is limited to menu/orders/branding:
--   select schemaname, tablename, policyname, roles, cmd
--     from pg_policies where schemaname='public' order by tablename, policyname;
-- Confirm anon has NO broad grants left (should be only the few from step 2):
--   select table_name, privilege_type from information_schema.role_table_grants
--     where grantee='anon' and table_schema='public' order by table_name;
-- ============================================================================
