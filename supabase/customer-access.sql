-- ============================================================
-- 顾客端(免登录扫码点餐)所需权限 — 在 Supabase SQL Editor 运行
-- 只开放最小权限:匿名(anon)可"读菜单 + 下单",其它一律仍被锁
-- ============================================================

-- 顾客可读菜单
drop policy if exists menu_anon_read on public.menu;
create policy menu_anon_read on public.menu
  for select to anon using (true);

-- 顾客可下单(只能新增,不能读改删别人的订单)
drop policy if exists orders_anon_insert on public.orders;
create policy orders_anon_insert on public.orders
  for insert to anon with check (true);

-- 确保 anon 角色有基础权限(之前已授权过,重复无害)
grant select on public.menu to anon;
grant insert on public.orders to anon;
