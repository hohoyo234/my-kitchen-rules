-- ============================================================================
-- BACKFILL kitchenId on older rows (run ONCE in Supabase SQL Editor)
-- ============================================================================
-- The app's RLS scopes every row to its data.kitchenId. Older seeded/test rows
-- (shifts, tasks, clockins, reservations, …) were written WITHOUT a kitchenId,
-- so after the security lockdown they were rejected on sync (the "Syncing · N"
-- backlog) and hidden on other devices. Tag the orphans with the demo venue
-- 'k_main' so they belong to a kitchen again. New writes are now stamped
-- automatically by db.js (stampTenant). Safe / idempotent: only touches rows
-- where kitchenId is currently missing.
-- ============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'menu','orders','shifts','tasks','swaps','sos','alerts','reconciliations',
    'clockins','members','coupons','customer_feedback','users','reservations','waitlist'
  ] loop
    -- skip tables that don't exist in this project yet
    if to_regclass('public.'||t) is not null then
      execute format(
        $f$ update public.%I
              set data = jsonb_set(coalesce(data,'{}'::jsonb), '{kitchenId}', '"k_main"')
            where data->>'kitchenId' is null $f$, t);
    end if;
  end loop;
end $$;
