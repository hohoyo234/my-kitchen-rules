-- ============================================================
-- 顾客自助查积分 — 在 Supabase SQL Editor 运行
-- 顾客在公开页面(#/points)输入手机号或会员编号，只能查到“自己这一条”
-- 的积分 / 余额 / 有效优惠券。用 SECURITY DEFINER 函数实现，anon 不能
-- 直接 select members（仍被 RLS 锁住），只能调用这个函数按精确匹配取一条。
-- 前提:已运行 supabase/membership-setup.sql(members + coupons 两张表)
-- ============================================================

create or replace function public.member_self_lookup(q text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m       record;
  qdigits text := regexp_replace(coalesce(q,''), '\D', '', 'g');
  cpns    jsonb;
begin
  -- 太短直接拒绝(避免空查/枚举)
  if length(trim(coalesce(q,''))) < 4 then
    return null;
  end if;

  -- 按会员编号(=id)精确匹配,或按手机号(纯数字)精确匹配
  select id, data into m
  from public.members
  where upper(id) = upper(trim(q))
     or (qdigits <> '' and regexp_replace(coalesce(data->>'phone',''), '\D', '', 'g') = qdigits)
  limit 1;

  if m.id is null then
    return null;
  end if;

  -- 该会员名下、未使用、未过期的优惠券
  select coalesce(jsonb_agg(jsonb_build_object(
            'code',     c.data->>'code',
            'type',     c.data->>'type',
            'value',    c.data->'value',
            'minSpend', c.data->'minSpend',
            'expiry',   c.data->>'expiry')), '[]'::jsonb)
  into cpns
  from public.coupons c
  where coalesce((c.data->>'used')::boolean, false) = false
    and (c.data->>'memberId') = m.id
    and (c.data->>'expiry' is null or (c.data->>'expiry') >= to_char(now(), 'YYYY-MM-DD'));

  return jsonb_build_object(
    'name',    m.data->>'name',
    'code',    m.id,
    'points',  coalesce((m.data->>'points')::int, 0),
    'balance', coalesce((m.data->>'balance')::numeric, 0),
    'coupons', cpns
  );
end;
$$;

-- 只暴露这个函数给前端;不要给 anon 直接读 members 表的权限
revoke all on function public.member_self_lookup(text) from public;
grant execute on function public.member_self_lookup(text) to anon, authenticated;
