-- ============================================================
-- 邮箱验证 — 在 Supabase SQL Editor 运行
-- 老板/全能助手给某邮箱发 6 位验证码(存到 verifications 表);收件人在公开
-- 页面 #/verify 输入验证码,调用 confirm_email_code 校验(anon 只能“核对自己
-- 那条”,看不到别人的码)。前提:已运行 security-setup.sql(定义 is_active 等)。
-- ============================================================

create table if not exists public.verifications(
  id text primary key, data jsonb, updated_at timestamptz default now()
);
-- data: {email, code, purpose, used, expires(ISO), kitchenId}

revoke all on public.verifications from anon;            -- anon 不能直接读这张表
grant select, insert, update, delete on public.verifications to authenticated;
alter table public.verifications enable row level security;
alter table public.verifications force row level security;

drop policy if exists verifications_tenant on public.verifications;
create policy verifications_tenant on public.verifications for all to authenticated
  using      ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) )
  with check ( public.is_super() or (public.is_active() and (data->>'kitchenId') = public.my_kitchen()) );

-- 公开校验函数:按 邮箱+验证码 精确匹配一条未用、未过期的记录,命中就标记已用。
create or replace function public.confirm_email_code(p_email text, p_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v record;
begin
  if length(trim(coalesce(p_code,''))) < 4 then return jsonb_build_object('ok', false); end if;
  select id into v from public.verifications
  where lower(data->>'email') = lower(trim(p_email))
    and (data->>'code') = trim(p_code)
    and coalesce((data->>'used')::boolean, false) = false
    and ((data->>'expires')::timestamptz) > now()
  order by (data->>'expires')::timestamptz desc
  limit 1;
  if v.id is null then return jsonb_build_object('ok', false); end if;
  update public.verifications
     set data = jsonb_set(data, '{used}', 'true'::jsonb), updated_at = now()
   where id = v.id;
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.confirm_email_code(text, text) from public;
grant execute on function public.confirm_email_code(text, text) to anon, authenticated;
