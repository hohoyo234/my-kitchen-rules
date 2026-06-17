# 安全说明与上线清单 (Security & Go-Live Runbook)

> 一句话原理：**这是纯前端 app，浏览器里的任何判断顾客都能改。所以"谁能看什么"必须由数据库（Supabase）把关，而不是浏览器。**
> 本次改造就是把这道闸门补齐、并把判断权从浏览器搬进数据库。

---

## 一、5 个问题 → 对应修复

| # | 原问题（你的说法） | 根因 | 本次修复 |
|---|---|---|---|
| 1 | "你是不是老板"的牌子挂在客人胸前，改浏览器就能进老板后台 | 角色存在浏览器 `localStorage`，界面只看这个 | 角色改为**服务端 `profiles` 表**决定；并由 **RLS** 在每次查询时按真实身份 (`auth.uid()`) 重新校验。改浏览器没用——数据库会拒绝返回不属于你的数据。 |
| 2 | 密码明文存（像贴墙上的便利贴） | 演示账号 `pw:'boss1111'` 写进 `users` 表，明文比对 | 改用 **Supabase Auth**，密码由云端用 bcrypt 加密保存，**app 不再存任何密码**。`seed.js` 已删除 `pw`。 |
| 3 | 超管密码 `admin1234` 写死在代码里 | `auth.js` 常量 `SUPER_PW` | **已删除**。超管改为一个普通 Supabase Auth 账号 + `profiles.role='superadmin'`，用真实密码登录。 |
| 4 | 护照/税号"锁了保险箱，钥匙贴在箱子上" | AES 密钥存进会同步上云的 `app_meta`，和密文同处 | 真正的锁现在是 **RLS：`onboarding` 表仅"该员工本人或其餐厅老板"可读**。AES 密钥已**移出同步存储**（只留本地）。终态见 `supabase/functions/reveal-field`（密钥放 Vault，服务端解密，浏览器永不持钥）。 |
| 5 | "总闸门"`is_active` 代码里根本没有 | `is_active()`/`profiles`/核心表 RLS 从未写进项目 | **已补齐**：`supabase/security-setup.sql` 完整定义闸门，并锁死每张表。**这一条你必须先去后台确认现状（见下）。** |

---

## 二、🚨 最先做：去后台确认"总闸门"现在是开还是关 (#5)

> 在还没跑下面的 SQL 之前，你那把**公开的 anon key**（写在 `js/supa.js`、且在公开仓库里）能干多少，全看后台 RLS 现状。先确认，别拖。

1. 打开 https://supabase.com/dashboard → 选你的项目 (`gopluilwaltawempixeg`)。
2. **Database → Tables**：逐个看 `users / orders / onboarding / audit / shifts / clockins ...`，每张表右侧应显示 **"RLS enabled"**。
   - ❌ 若某张表显示 **"RLS disabled" / "Unrestricted"** → 这就是敞开的门：任何拿到 anon key 的人都能读写它。
3. **Authentication → Policies**（或 Database → Policies）：看每张表的策略。
   - ❌ 危险信号：出现 `to anon ... USING (true)` 这种"谁来都放行"的读策略（`menu` 的可读、`kitchens` 的分支展示是有意为之，其余表都不该有）。
4. 想用 SQL 一次看全，在 **SQL Editor** 跑（`security-setup.sql` 末尾也附了这几条）：
   ```sql
   -- 每张表都应 rowsecurity = true
   select relname, relrowsecurity from pg_class
     where relnamespace='public'::regnamespace and relkind='r' order by relname;
   -- 列出所有策略，确认 anon 只能碰 menu/orders/branding
   select tablename, policyname, roles, cmd from pg_policies
     where schemaname='public' order by tablename;
   ```
   **若发现核心表 RLS 是关的 → 说明此前任何人都可能已经能拉走数据。** 跑完下面的 `security-setup.sql` 即可把门锁上。

---

## 三、上线切换 Runbook（按顺序做）

> ⚠️ 这是一次**有破坏性的切换**：执行后，旧的"本地明文密码登录"全部失效，每个能登录的人都必须①有 Supabase Auth 账号、②在 `profiles` 表里有一行。请按顺序做完再发布前端。

**1. 锁后台（最重要）**
   - SQL Editor 跑 `supabase/security-setup.sql`（幂等，可重复跑）。它会建好 `profiles`、闸门函数 (`is_active/my_role/...`)，并给每张表加上 RLS。

**2. 建超级管理员（替换 admin1234）**
   - Authentication → Users → **Add user**：邮箱 `hyy7010@gmail.com`，设一个**强密码**。
   - 回 SQL Editor 跑 `security-setup.sql` 第 13 节那段 `insert into public.profiles ... 'superadmin' ...`（已注释好，去掉注释跑）。
   - 以后超管用这个真实密码登录，代码里不再有任何密码。

**3. 建真实账号（老板/经理/员工）**
   - 生产：在 Authentication → Users 给每个人建账号（强密码），再在 `profiles` 插入对应行（role/kitchen_id/staff_id）。
   - 仅演示：浏览器控制台跑 `MKR.setup.createDemoAccounts()` → 它会建好 5 个 Auth 账号并**打印一段 `insert into profiles...` SQL**，把它粘进 SQL Editor 跑即可。
   - 之后正常运营时：老板/经理用 app 内"招人"、登录页"申请开店/加入链接"创建的人，会自动建 Auth 账号；老板/超管审批时自动写 `profiles`（已接好）。

**4. 清掉旧的明文残留**
   - SQL Editor 跑：
     ```sql
     delete from public.app_meta where key in ('_fieldkey','_fieldkey_fb');
     ```
     （旧版把加密钥匙存这儿了，现在钥匙改为本地存储，这两行要删掉。）
   - 旧的演示数据里若还有带 `pw` 字段的 `users` 行，可在 `data` 里清掉（新代码不再写、也不再读它）。

**5. （推荐）部署 #4 终态 Edge Function**
   - `supabase functions deploy reveal-field`
   - `supabase secrets set FIELD_KEY=$(openssl rand -base64 32)`
   - 之后把 `owner.js` 里 `MKR.crypto.dec(...)` 的揭示按钮改为调用该函数（POST 带用户 token）。这样护照/税号的钥匙彻底不进浏览器，且支持跨设备由老板揭示。

**6. 轮换任何曾经公开过的密码**
   - 凡是曾经出现在公开仓库里的密码（boss1111/admin1234 等），都视为已泄露，换掉。
   - anon key **不用换**（它本就设计为公开，靠 RLS 把关）；但若 `service_role` 密钥任何时候进过仓库/聊天记录，**必须立刻轮换**（Settings → API → Reset）。

**7. 发布前端**
   - 缓存号已从 `?v=34` 升到 `?v=35`、SW `v17→v18`。把这份代码发上去即可。

---

## 四、切换后"谁能做什么"（验收要点）

- 改浏览器 `localStorage` 把自己写成 `role:"owner"` → 仍能看到老板的**菜单按钮**，但**点开任何数据都是空/被拒**（RLS 按真实 JWT 校验）。✅ 这就是修复 #1 的本质：界面可骗，数据骗不了。
- 拿公开 anon key 直连数据库 → 只能读菜单、下单、读餐厅 logo、提交开店申请；其余全 `42501` 拒绝。✅ 修复 #5。
- 经理/其他员工 → 读不到别人的护照/税号（`onboarding` 仅本人或本店老板可读）。✅ 修复 #4。
- 经理 → 只能建 `staff`，建不了 `owner/manager`（防越权）；任何人都改不动自己的 `profiles.role`（防自升级）。✅ 修复 #1。
- `audit` 表 → 可追加、老板/超管可读、**无人可改/删**（RLS forced + 无 update/delete 策略）。

---

## 五、残留风险 / 后续

- **#4 默认仅 RLS + 本地密钥**：未部署 `reveal-field` 前，护照/税号在另一台设备上无法揭示（密钥在原设备）。生产建议走第 5 步的 Edge Function。
- **provisioning（申请/加入/招人）**：目前由前端 `signUp` + 审批时写 `profiles` 完成（已接 RLS）。更稳的做法是用一个 service-role 的 Edge Function 统一发号，避免依赖客户端逐步写库——列为下一步增强。
- **邮箱确认**：Supabase 默认可能要求邮箱确认。用合成邮箱 `username@mkr.app` 时，去 Authentication → Providers → Email 关掉 "Confirm email"，或改用真实邮箱。
- **Google 登录**：仍是"仅邀请"——必须先有 `profiles` 行，否则登录被拒并提示。
