/* ===== System language (English / 简体中文) =====
   Adds a bilingual layer on top of the (English-source) UI.

   How it works:
   - The whole app renders in English as the source of truth.
   - When the language is set to 中文, a MutationObserver walks the DOM and
     translates static text nodes + placeholder/title/aria-label attributes by
     EXACT match against the dictionary below. Exact match means dynamic values
     (money, names, IDs, interpolated strings) never get touched.
   - Because toasts / modals / confirmations all render through innerHTML, they
     get translated automatically too — no need to wrap every call site.

   To extend coverage: add `"English source": "中文"` pairs to T below.
*/
window.MKR = window.MKR || {};
(function(){
  const STORE='mkr_lang';
  let lang = (function(){ try{ return localStorage.getItem(STORE)||'en'; }catch(e){ return 'en'; } })();

  // ---- Dictionary: exact English source -> 简体中文 ----
  const T = {
    // Roles / nav / subtitles
    "Owner":"老板", "Manager":"经理", "Staff":"员工",
    "Hands-off management — results & approvals only":"省心管理 — 只看结果与审批",
    "Run operations & lead the team · roster / add users / review":"运营与带队 · 排班 / 加人 / 审核",
    "Simple execution · shifts / clock-in / claim":"简单执行 · 班次 / 打卡 / 抢班",
    "Dashboard":"工作台", "Daily report":"每日报告", "Alerts":"提醒", "Audit log":"审计日志",
    "Labor cost":"人力成本", "Team":"团队", "Super Admin":"超级管理员", "Compliance":"合规",
    "Feedback":"顾客反馈", "Switch view":"切换视图", "Settings":"设置",
    "Rostering":"排班", "Add Users":"添加员工", "Menu & Items":"菜单与菜品",
    "Tasks":"任务", "Swaps / SOS":"换班 / SOS", "POS":"收银", "Kitchen":"后厨", "Table QR":"桌台二维码",
    "My shifts":"我的班次", "Availability":"可用时间", "Today's tasks":"今日任务",
    "Swap market":"换班市场", "My profile":"我的资料",
    "Log out":"退出登录", "Connected":"已连接",

    // Network status (net.js)
    "Cloud connected":"云端已连接", "Connected (local)":"已连接（本地）",
    "⚠️ Network lost · running in offline-safe mode — keep working, it will sync automatically when back online":"⚠️ 网络中断 · 已进入离线安全模式 — 可继续操作，恢复网络后自动同步",
    "Back online — syncing in the background…":"已恢复在线 — 正在后台同步…",
    "All data synced to the cloud":"所有数据已同步到云端",
    "Network lost · switched to offline-safe mode — keep working":"网络中断 · 已切换到离线安全模式 — 可继续操作",
    "Back to Owner →":"返回老板视图 →",

    // ---- Login ----
    "Restaurant manager · Secure login":"餐厅管理系统 · 安全登录",
    "Username or ID":"用户名或 ID", "Password":"密码", "Sign in":"登录",
    "or":"或", "Continue with Google":"使用 Google 登录",
    "Demo accounts (tap a role to fill):":"演示账号（点击角色自动填充）：",
    "Each account is separate and isolated by role; access is revoked instantly on offboarding.":"每个账号独立、按角色隔离；离职后即时收回访问权限。",
    "Signing in…":"正在登录…", "Loading…":"加载中…", "Redirecting to Google…":"正在跳转到 Google…",
    "Google sign-in is not enabled for this project yet.":"本项目尚未启用 Google 登录。",
    "Language":"语言",

    // ---- Owner: Feedback ----
    "Customer feedback":"顾客反馈",
    "Bad reviews kept internal (1-3★) for you to handle; 4-5★ sent to Google":"差评（1-3★）仅内部保留供你处理；好评（4-5★）引导至 Google",
    "⭐ Average rating":"⭐ 平均评分", "😟 Bad (1-3★)":"😟 差评（1-3★）", "🔔 Urges today":"🔔 今日催单",
    "kept internal":"仅内部可见", "No customer reviews yet":"暂无顾客评价",
    "1-3★ reviews are never public — shown only here so you can reach out privately; 4-5★ guests are guided to Google to boost public reputation.":"1-3★ 评价不会公开 — 仅在此显示，方便你私下跟进；4-5★ 顾客被引导到 Google 以提升公开口碑。",
    "Bad":"差评", "Good":"好评",

    // ---- Owner: Switch view ----
    "The owner can preview any portal and see exactly what staff / managers see":"老板可预览任意端，看到员工 / 经理所见的界面",
    "Dashboard · your current portal":"工作台 · 你当前所在端",
    "Manager · Roster":"经理 · 排班", "Smart rostering / add users / review":"智能排班 / 添加员工 / 审核",
    "Menu & Items":"菜单与菜品", "Add dishes / upload photos":"添加菜品 / 上传图片",
    "Ordering · blind drop":"点单 · 盲投对账",
    "Kitchen KDS":"后厨 KDS", "Live tickets":"实时出单",
    "Staff · Shifts":"员工 · 班次", "Clock-in / availability / claim":"打卡 / 可用时间 / 抢班",
    "Staff · Availability":"员工 · 可用时间", "When staff can work":"员工可上班的时间",
    "Inside another portal the top shows an \"Owner preview\" banner — tap \"Back to Owner\" to return.":"进入其他端时顶部会显示「老板预览」横幅 — 点击「返回老板视图」即可返回。",

    // ---- Owner: Settings ----
    "Toggle modules · control which roles can access each one":"开关各模块 · 控制每个模块对哪些角色开放",
    "Save settings":"保存设置",
    "Disabled features disappear from the matching portal's nav and direct access is blocked; saving applies to every device in the venue. Owner core (dashboard / audit / compliance / settings) is always available.":"关闭的功能会从对应端的导航中消失并禁止直接访问；保存后对门店所有设备生效。老板核心功能（工作台 / 审计 / 合规 / 设置）始终可用。",
    "On":"开启", "Off":"关闭", "Enabled":"启用",
    "Settings saved across the venue":"设置已在全店保存",
    "System language":"系统语言", "English / 简体中文":"English / 简体中文",

    // ---- Owner: Dashboard ----
    "Runs quietly — only pings you when something's wrong":"安静运行 — 只在出问题时提醒你",
    "Today's revenue":"今日营业额", "Cash variance":"现金差异", "Unread alerts":"未读提醒",
    "📈 Today's revenue":"📈 今日营业额", "💵 Blind-drop variance":"💵 盲投差异",
    "🧾 Today's orders":"🧾 今日订单", "🚨 Unread alerts":"🚨 未读提醒",
    "Not reconciled":"未对账", "Normal":"正常", "Over threshold":"超出阈值",
    "Needs attention ›":"需关注 ›", "All good ›":"一切正常 ›",
    "🚨 Alerts · only when it matters":"🚨 提醒 · 仅在关键时刻", "All →":"全部 →",
    "📩 Today at a glance":"📩 今日概览", "Full report →":"完整报告 →",
    "Cash blind-drop variance":"现金盲投差异", "Tomorrow's bookings (demo)":"明日预订（演示）",
    "This system aggregates and exports data; it does not connect to the ATO or give tax advice — final tax figures are confirmed by your accountant.":"本系统仅汇总与导出数据；不连接 ATO，也不提供税务建议 — 最终税务数字由你的会计确认。",
    "No issues — running quietly":"没有问题 — 安静运行中",

    // ---- Owner: Daily report ----
    "Daily smart report":"每日智能报告",
    "Auto-pushed at close — the whole picture without logging in":"打烊时自动推送 — 不登录也能掌握全局",
    "My Kitchen manager":"My Kitchen 管家", "Revenue":"营业额", "Orders":"订单",
    "📲 Re-push to my phone":"📲 重新推送到我的手机",
    "Report pushed (demo — not actually sent)":"报告已推送（演示 — 未实际发送）",

    // ---- Owner: Alerts ----
    "Critical alerts":"关键提醒",
    "Only fires on variance / big refunds / lateness etc.":"仅在差异 / 大额退款 / 迟到等情况触发",
    "Mark all read":"全部标为已读", "No alerts — all good":"暂无提醒 — 一切正常",
    "Read":"已读", "Mark read":"标为已读",

    // ---- Owner: Audit ----
    "Sensitive-action audit":"敏感操作审计",
    "Edits / cancels / discounts / refunds fully tracked · append-only, tamper-proof":"改单 / 取消 / 折扣 / 退款全程记录 · 仅追加、防篡改",
    "No actions recorded yet":"暂无操作记录",
    "The audit log is append-only — there is no delete or edit path anywhere in the system.":"审计日志仅可追加 — 系统中任何地方都没有删除或修改入口。",
    "System":"系统",
    // audit action labels (audit.js)
    "Cancel order":"取消订单", "Manual discount":"手动折扣", "Refund":"退款",
    "New order":"新订单", "Edit order":"修改订单", "Blind drop":"盲投对账",
    "Offboard staff":"员工离职", "Hire / onboard":"入职 / 招聘", "Reveal TFN":"查看 TFN",
    "Add shift":"添加班次", "Remove shift":"删除班次", "Approve labor cost":"批准人力成本",
    "Reject labor cost":"驳回人力成本", "Post SOS shift":"发布 SOS 班次", "Approve swap":"批准换班",
    "Sign in":"登录", "Export data":"导出数据", "Super reminder":"养老金提醒",
    "Add menu item":"新增菜品", "Edit menu item":"编辑菜品", "Remove menu item":"删除菜品",
    "Update settings":"更新设置", "Create kitchen":"创建门店", "Approve kitchen":"批准门店",

    // ---- Owner: Labor ----
    "Labor cost approval":"人力成本审批",
    "Forecasts next week's revenue and labor ratio; auto-flags overruns in red":"预测下周营业额与人力占比；超标自动标红",
    "Forecast revenue (next week)":"预测营业额（下周）", "Rostered wages (ref.)":"排班工资（参考）",
    "Labor ratio":"人力占比",
    "Labor ratio is healthy — nothing to action.":"人力占比健康 — 无需处理。",
    "Approve this week's roster cost":"批准本周排班成本",
    "Wage figures are an award-based <b>indicative</b> calculation — please review before confirming.":"工资数字基于行业标准（Award）的<b>参考</b>计算 — 请确认前先核对。",
    "Approve":"批准", "Reject · request changes":"驳回 · 要求修改",
    "Figures are indicative; the employer confirms. This system gives no tax advice and does no filing.":"数字仅供参考，由雇主确认。本系统不提供税务建议、不代为申报。",
    "Approved":"已批准", "Rejected — the manager has been notified":"已驳回 — 已通知经理",

    // ---- Owner: Super Admin / Kitchens ----
    "Super Admin · Kitchens":"超级管理员 · 门店",
    "Master dashboard — full visibility and provisioning across every venue (tenant)":"总控台 — 对每个门店（租户）全可见并可开通",
    "＋ Create kitchen":"＋ 创建门店",
    "🏢 Kitchens":"🏢 门店", "✅ Active":"✅ 已启用", "⏳ Pending approval":"⏳ 待审批", "👥 Total users":"👥 用户总数",
    "Each kitchen is an isolated tenant. From here you have global visibility into every kitchen's data, configuration and users, and you approve or onboard new ones.":"每个门店都是独立租户。在此你可全局查看每个门店的数据、配置与用户，并审批 / 开通新门店。",
    "Active":"已启用", "Pending":"待审批", "Primary":"主店",
    "View ›":"查看 ›", "← Back to kitchens":"← 返回门店列表",
    "Approve & provision":"批准并开通",
    "Kitchen / venue name":"门店 / 场所名称", "Location":"位置",
    "New kitchens start as <b>Pending</b> until you approve them from this dashboard.":"新门店初始为<b>待审批</b>，需你在此控台批准后启用。",
    "Create a new kitchen":"创建新门店", "Create (pending)":"创建（待审批）",
    "Please enter a name":"请输入名称",
    "Kitchen created — pending approval":"门店已创建 — 待审批",
    "Kitchen approved & provisioned":"门店已批准并开通", "Kitchen approved":"门店已批准",
    "👑 Owners":"👑 老板", "📋 Managers":"📋 经理", "🧑‍🍳 Staff":"🧑‍🍳 员工", "🍽️ Menu items":"🍽️ 菜品数",
    "Hierarchy & unique IDs":"层级与唯一 ID", "Owners":"老板", "Managers":"经理",
    "⚙️ Configuration snapshot":"⚙️ 配置快照", "None":"无",
    "Operating hours":"营业时间", "Labor ratio red line":"人力占比红线",
    "Cash variance threshold":"现金差异阈值", "Student-visa fortnight cap":"学签两周上限",
    "Every user has a unique ID for signing into their customised portal. Tap a person to open their full profile.":"每位用户都有唯一 ID 登录其专属端。点击某人可打开其完整档案。",
    "Offboarded":"已离职",

    // ---- Owner: Team & staff profile ----
    "Tap a staff member for the full, editable profile (phone / email / passport / visa / contract / bank / TFN)":"点击员工查看可编辑的完整档案（电话 / 邮箱 / 护照 / 签证 / 合同 / 银行 / TFN）",
    "Only the owner role can reveal a TFN / passport (each reveal is audited); offboarded staff data is encrypted and retained for 7 years for audit.":"仅老板角色可查看 TFN / 护照（每次查看都会审计）；离职员工数据加密保存 7 年以备审计。",
    "Staff member not found":"未找到该员工", "← Back to team":"← 返回团队",
    "Basic info":"基本信息", "Phone":"电话", "Email":"邮箱", "Position":"职位", "Age":"年龄",
    "Start date":"入职日期", "Address":"地址", "Emergency contact":"紧急联系人",
    "Visa & compliance":"签证与合规", "Visa type":"签证类型", "Visa expiry":"签证到期",
    "Fortnight hours":"两周工时", "Contract type":"合同类型", "Passport no.":"护照号",
    "Reveal":"查看", "Not provided":"未提供", "Uploaded":"已上传", "View":"查看",
    "Pay · bank · tax":"工资 · 银行 · 税务", "Base rate (ref.)":"基础时薪（参考）",
    "Super fund":"养老金账户", "Bank BSB / acct":"银行 BSB / 账号", "TFN":"税号 TFN",
    "(not submitted)":"（未提交）",
    "Onboarding documents":"入职文件", "Passport / ID":"护照 / 证件",
    "TFN declaration form":"TFN 申报表", "Super choice form":"养老金选择表",
    "Onboarding":"入职", "Complete":"已完成",
    "Offboard archive":"离职归档", "Offboarded on":"离职日期", "Retained until":"保留至",
    "TFN / passport are encrypted separately and only the owner can reveal them; each reveal is written to the audit log.":"TFN / 护照单独加密，仅老板可查看；每次查看都会写入审计日志。",
    "✏️ Edit profile":"✏️ 编辑档案", "Reactivate":"重新启用", "Offboard":"离职处理",
    "Document":"文件",
    "Visa type":"签证类型", "None / citizen / PR":"无 / 公民 / PR", "Student visa":"学生签证",
    "Work visa":"工作签证", "PR":"PR", "Australian citizen":"澳大利亚公民",
    "Casual":"临时工", "Part-time":"兼职", "Full-time":"全职",
    "Base rate AUD":"基础时薪 AUD", "Bank BSB":"银行 BSB", "Account number":"账号",
    "Save profile":"保存资料", "Cancel":"取消",
    "Passport / TFN are AES-encrypted and stored separately — only the owner can reveal them.":"护照 / TFN 采用 AES 加密并单独存储 — 仅老板可查看。",
    "Profile saved":"档案已保存",
    "Instant offboard cut-off":"即时离职断权",
    "Confirm offboard":"确认离职",

    // ---- Owner: Compliance ----
    "Super reminder · visa hours · food-safety audit report":"养老金提醒 · 签证工时 · 食品安全审计报告",
    "💼 Super reminder":"💼 养老金提醒",
    "Confirm Super is paid before this quarter's deadline to avoid late penalties.":"请在本季度截止前确认已缴养老金，以免滞纳金。",
    "Mark as reminded":"标记为已提醒", "Recorded":"已记录",
    "🛂 Visa-hours overview":"🛂 签证工时概览", "No student-visa staff":"暂无学签员工",
    "📋 Food-safety audit report (one-tap export)":"📋 食品安全审计报告（一键导出）",
    "📄 Export today's food-safety log":"📄 导出今日食品安全记录",
    "📊 Export sales / wages CSV":"📊 导出销售 / 工资 CSV",
    "🗄️ Offboarded staff data retention (7 years)":"🗄️ 离职员工数据留存（7 年）",
    "No offboard archive":"暂无离职归档",
    "This system aggregates and exports data; it does not connect to the ATO or give tax advice — final wage / tax figures are confirmed by the accountant / employer.":"本系统仅汇总与导出数据；不连接 ATO，也不提供税务建议 — 最终工资 / 税务数字由会计 / 雇主确认。",
    "↺ Reset demo data":"↺ 重置演示数据", "Reset demo data":"重置演示数据",
    "This clears all local data and reloads the demo accounts. Continue?":"这将清除所有本地数据并重新加载演示账号。是否继续？",
    "Reset":"重置", "CSV exported":"CSV 已导出",

    // ---- Manager: Menu ----
    "Add new dishes and upload product images — changes show instantly on POS and table ordering":"添加新菜品并上传图片 — 改动会即时显示在收银与桌台点单",
    "＋ Add dish":"＋ 添加菜品",
    "🍽️ Total dishes":"🍽️ 菜品总数", "🗂️ Categories":"🗂️ 分类", "📷 With photo":"📷 有图片",
    "Edit":"编辑", "Dish name":"菜品名称", "Category":"分类", "Price (AUD)":"价格（AUD）",
    "Product image":"菜品图片",
    "Edit dish":"编辑菜品", "Add new dish":"添加新菜品",
    "Save changes":"保存修改", "Add to menu":"加入菜单",
    "Please enter a dish name":"请输入菜品名称", "Please enter a valid price":"请输入有效价格",
    "Dish updated":"菜品已更新", "Dish added":"菜品已添加", "Dish removed":"菜品已删除",
    "Remove dish":"删除菜品", "Remove":"删除",
    "Mains":"主菜", "Snacks":"小吃", "Drinks":"饮品", "Desserts":"甜点", "Sides":"配菜", "Other":"其他",

    // ---- Manager: Rostering ----
    "Smart rostering":"智能排班",
    "Auto-roster from availability · drag to adjust · student-visa hours hard-capped":"按可用时间自动排班 · 拖拽调整 · 学签工时硬性封顶",
    "⚙️ Shift settings":"⚙️ 班次设置", "⚡ Auto-roster":"⚡ 自动排班",
    "👥 Total staff":"👥 员工总数", "on the roster":"在排班中",
    "💰 This week's wages":"💰 本周工资", "indicative · confirm before pay":"参考值 · 发薪前确认",
    "📊 % of forecast revenue":"📊 占预测营业额",
    "Everyone's weekly hours":"全员本周工时", "No staff yet":"暂无员工",
    "Operating hours":"营业时间", "Opening time":"开店时间", "Closing time":"关店时间",
    "Shift slots (flexible)":"班次时段（灵活）", "＋ Add slot":"＋ 添加时段",
    "Roles / departments":"角色 / 部门", "Custom roles (comma separated)":"自定义角色（逗号分隔）",
    "Role-based fixed shifts":"按角色固定班次",
    "Departments that run fixed hours (e.g. Kitchen) are placed at these exact times by the auto-roster.":"固定工时的部门（如后厨）会被自动排班放在这些固定时间。",
    "Add roles above to configure fixed hours.":"在上方添加角色以配置固定工时。",
    "Shift settings":"班次设置",
    "Shift slots saved":"班次设置已保存", "Shift settings saved":"班次设置已保存",
    "Auto-roster":"自动排班",
    "This clears this week's roster and regenerates it from staff availability. Continue?":"这将清空本周排班并根据员工可用时间重新生成。是否继续？",
    "Generate":"生成",
    "Staff":"员工", "Quick slot":"快速时段", "Custom":"自定义", "Start":"开始", "End":"结束",
    "Save shift":"保存班次", "End time must be after start":"结束时间必须晚于开始时间",
    "Got it":"知道了", "Shift saved":"班次已保存",

    // ---- Manager: Add Users ----
    "One-Click Add Users":"一键添加员工",
    "Enter a phone number + employment type — the system creates a compliant onboarding link to send the new starter":"输入电话 + 雇佣类型 — 系统会生成合规的入职链接发给新员工",
    "New starter's phone":"新员工电话", "Name (optional)":"姓名（可选）",
    "Employment type":"雇佣类型", "Role":"角色",
    "Holds a student visa?":"是否持学生签证？", "No":"否", "Yes · student visa (enable hours cap)":"是 · 学生签证（启用工时上限）",
    "📩 Create account & send link":"📩 创建账号并发送链接",
    "The onboarding pack includes the TFN declaration, Super choice and bank details forms (Fair Work / Privacy Act).":"入职资料包含 TFN 申报、养老金选择与银行信息表（符合 Fair Work / 隐私法）。",
    "Pending / onboarding":"待入职 / 入职中", "No new starters waiting":"没有等待中的新员工",
    "Copy link":"复制链接", "Onboarding link copied":"入职链接已复制",
    "Please enter a phone number":"请输入电话号码", "Creating account…":"正在创建账号…",
    "Send these details to the new starter":"将以下信息发给新员工",
    "After signing in to the Staff portal, they complete onboarding (Passport / TFN / Super / bank) under \"My profile\".":"登录员工端后，他们在「我的资料」中完成入职（护照 / TFN / 养老金 / 银行）。",
    "Done":"完成", "Kitchen":"后厨", "Front of House":"前厅", "Cashier":"收银", "Dishwasher":"洗碗", "Head Chef":"主厨",

    // ---- Manager: Tasks ----
    "Daily task checklist":"每日任务清单",
    "Publish cleaning / prep / temperature checks · review the digital logs and photos staff submit":"发布清洁 / 备料 / 测温 · 查看员工提交的电子记录与照片",
    "+ Add task":"+ 添加任务", "Today's progress":"今日进度", "Waiting on staff":"等待员工",
    "No photo":"无照片", "Submitted photo":"提交的照片",
    "Add task":"添加任务", "Task name":"任务名称", "Publish":"发布", "Task published":"任务已发布",

    // ---- Manager: Swaps / SOS ----
    "Swaps / SOS dispatch":"换班 / SOS 调度",
    "Approve swap requests · post a rewarded urgent cover shift when it gets slammed":"审批换班申请 · 忙不过来时发布带奖励的紧急补班",
    "🆘 Post SOS cover":"🆘 发布 SOS 补班",
    "Swap requests to approve":"待审批的换班申请", "Active SOS cover":"进行中的 SOS 补班",
    "No swaps to approve":"没有待审批的换班", "Reject":"驳回",
    "No active SOS":"没有进行中的 SOS", "Covered":"已补上", "Recruiting":"招募中",
    "Time / description":"时间 / 描述", "Reward":"奖励",
    "🆘 Post urgent SOS cover":"🆘 发布紧急 SOS 补班", "Push to available staff":"推送给可用员工",
    "Approved — posted to the swap market":"已批准 — 已发布到换班市场",
    "SOS pushed to all available staff":"SOS 已推送给所有可用员工",

    // ---- Manager: Table QR ----
    "Table QR ordering":"桌台二维码点单",
    "Stick a QR on each table — guests scan to order without signing in, straight to the kitchen":"在每张桌子贴上二维码 — 顾客扫码即可免登录点单，直达后厨",
    "Tables":"桌数", "Preview order page ↗":"预览点单页 ↗",

    // ---- Staff: Availability ----
    "Pick the times you can work each day — the manager's auto-roster prioritises what you fill in":"选择你每天可上班的时间 — 经理的自动排班会优先按你填写的来",
    "Save":"保存",
    "This is just your availability — the final roster is set by your manager.":"这只是你的可用时间 — 最终排班由经理决定。",
    "Morning 09-15":"早班 09-15", "Evening 15-22":"晚班 15-22", "All day 09-22":"全天 09-22",
    "Availability saved":"可用时间已保存",

    // ---- Staff: My shifts ----
    "One-tap clock-in on the day · drop a shift if something comes up":"当天一键打卡 · 有事可放出班次",
    "this week":"本周", "No shifts rostered this week":"本周暂无排班",
    "Clock in":"打卡上班", "Drop":"放班", "Today":"今天",
    "Drop to the swap market":"放到换班市场", "Reason (optional)":"原因（可选）", "Confirm drop":"确认放班",
    "Submitted — waiting on manager approval, then it goes to the swap market":"已提交 — 等待经理批准后进入换班市场",

    // ---- Staff: Today's tasks ----
    "Today's task checklist":"今日任务清单",
    "Tick when done and upload a photo · temperature checks need a value":"完成后勾选并上传照片 · 测温需填写数值",
    "Progress":"进度", "Tap the box on the left to complete":"点击左侧方框完成",
    "Fridge temperature check":"冰箱测温", "Record temperature (°C)":"记录温度（°C）",
    "Record & complete":"记录并完成", "Photo uploaded":"照片已上传",

    // ---- Staff: Swap market ----
    "Swap market · claim shifts":"换班市场 · 抢班",
    "Pick up a colleague's dropped shift · claim an urgent SOS cover in one tap":"接手同事放出的班次 · 一键认领紧急 SOS 补班",
    "🆘 Urgent cover (with reward)":"🆘 紧急补班（带奖励）",
    "🔁 Shifts colleagues dropped":"🔁 同事放出的班次",
    "No urgent cover right now":"暂时没有紧急补班", "Claim":"认领", "You got it":"已被你认领",
    "No shifts to claim":"没有可认领的班次", "Take it":"接班",
    "Taken — the shift is now on your roster":"已接班 — 该班次已加入你的排班",

    // ---- Staff: My profile / onboarding ----
    "Edit your details and complete the documents your manager requires":"编辑你的信息并完成经理要求的文件",
    "Onboarding complete":"入职已完成", "Onboarding in progress":"入职进行中",
    "Onboarding checklist":"入职清单", "Personal details":"个人信息",
    "Full name":"姓名", "Add":"添加", "Update":"更新", "Upload":"上传", "Fill in":"填写",
    "Save profile":"保存资料", "🗓️ Set my availability":"🗓️ 设置我的可用时间",
    "Bank details":"银行信息", "Submit onboarding":"提交入职",
    "I confirm the above is true and accurate":"我确认以上信息真实准确",
    "Confirm & submit":"确认并提交", "Please tick the confirmation":"请勾选确认项",
    "Passport saved":"护照已保存", "Super choice saved":"养老金选择已保存",
    "Bank details saved":"银行信息已保存", "Your staff ID":"你的员工 ID",
    "Member number (optional)":"会员号（可选）", "Super fund name":"养老金账户名称",

    // ---- POS ----
    "POS / Ordering":"收银 / 点单",
    "Fast ordering · change & receipts · closing blind drop":"快速点单 · 找零与小票 · 打烊盲投",
    "🥁 Blind drop":"🥁 盲投对账", "📋 Today's orders":"📋 今日订单",
    "All":"全部", "Current order":"当前订单", "Subtotal":"小计", "Discount":"折扣",
    "Total due":"应收合计", "💳 Pay & send":"💳 收款并下单", "Clear":"清空",
    "Cancels, discounts and refunds are all written to the tamper-proof audit log.":"取消、折扣与退款都会写入防篡改的审计日志。",
    "No items yet — add dishes in Menu & Items":"暂无菜品 — 请在「菜单与菜品」中添加",
    "Tap a dish on the left to start an order":"点击左侧菜品开始点单",
    "+ Add note":"+ 添加备注", "Save":"保存",
    "Manual discount":"手动折扣", "Discount percent %":"折扣百分比 %", "Apply":"应用",
    "Clear order":"清空订单", "Clear the current order?":"确定清空当前订单吗？",
    "Restored your last unfinished order":"已恢复你上次未完成的订单",
    "Payment":"付款", "Confirm payment · send to kitchen":"确认付款 · 送往后厨",
    "💵 Cash":"💵 现金", "💳 Card":"💳 刷卡", "Cash received":"实收现金", "Change":"找零",
    "Closing blind drop":"打烊盲投",
    "The expected total is hidden. First <b>blind-count the drawer cash</b> and enter it; the system then compares and generates a variance report.":"应收金额已隐藏。请先<b>盲点钱箱现金</b>并录入；系统随后比对并生成差异报告。",
    "Tap note / coin counts":"点选纸币 / 硬币数量", "Blind-counted total":"盲点合计",
    "Submit reconciliation":"提交对账", "Reconciliation result":"对账结果",
    "No orders yet today":"今天还没有订单", "Today's orders":"今日订单",
    "Cooking":"制作中", "Refunded":"已退款", "Cancelled":"已取消",
    "Confirm refund":"确认退款", "Refunded and logged":"已退款并记录",

    // ---- KDS ----
    "Kitchen Display (KDS)":"后厨显示屏（KDS）",
    "Live large tickets · tap when done · instant front/back sync":"实时大字出单 · 完成即点 · 前后台即时同步",
    "Handled":"已处理", "Served":"已出餐", "✓ Mark served":"✓ 标记已出餐",

    // ---- Customer ----
    "Loading menu…":"正在加载菜单…",
    "Menu can't be loaded right now":"暂时无法加载菜单",
    "Please call a server or try again shortly":"请呼叫服务员或稍后再试",
    "Send to kitchen":"送往后厨", "Order more":"继续点单", "Retry":"重试",
    "🔔 Hurry up":"🔔 催一下", "Kitchen notified ✓":"已通知后厨 ✓",
    "How was your meal?":"用餐体验如何？", "Send feedback":"提交反馈",
    "Order failed":"下单失败", "Network issue — please call a server or retry":"网络异常 — 请呼叫服务员或重试",

    // ---- Days ----
    "Mon":"周一","Tue":"周二","Wed":"周三","Thu":"周四","Fri":"周五","Sat":"周六","Sun":"周日",

    // ---- Feature module labels (features.js) ----
    "POS / Ordering":"收银 / 点单", "Kitchen Display":"后厨显示屏",
    "Smart rostering":"智能排班", "One-Click Add Users":"一键添加员工",
    "Task checklist":"任务清单", "Swap / SOS approval":"换班 / SOS 审批",
    "Staff swap market":"员工换班市场", "Staff availability":"员工可用时间",
    "Table QR ordering":"桌台二维码点单", "Notifications & nudges":"通知与提醒",
  };

  function tr(s){
    if(s==null) return s;
    const key = String(s).trim();
    return T[key] || s;
  }

  // ---- DOM translation ----
  const ATTRS = ['placeholder','title','aria-label'];
  let applying = false, scheduled = false;

  function translateTextNode(node){
    const raw = node.nodeValue;
    if(!raw) return;
    const key = raw.trim();
    if(!key) return;
    const hit = T[key];
    if(hit && hit!==key){
      const lead = raw.match(/^\s*/)[0];
      const trail = raw.match(/\s*$/)[0];
      node.nodeValue = lead + hit + trail;
    }
  }

  function translateEl(el){
    for(const a of ATTRS){
      if(el.hasAttribute && el.hasAttribute(a)){
        const v = el.getAttribute(a);
        const hit = T[(v||'').trim()];
        if(hit && hit!==v) el.setAttribute(a, hit);
      }
    }
  }

  function apply(root){
    if(lang!=='zh' || !root) return;
    applying = true;
    try{
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode(n){
          if(n.nodeType===Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
          const tag = n.tagName;
          if(tag==='SCRIPT' || tag==='STYLE' || tag==='TEXTAREA') return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      // Translate the root element's own attributes too
      if(root.nodeType===Node.ELEMENT_NODE) translateEl(root);
      let n;
      while((n = walker.nextNode())){
        if(n.nodeType===Node.TEXT_NODE) translateTextNode(n);
        else translateEl(n);
      }
    }finally{ applying = false; }
  }

  function schedule(){
    if(scheduled) return;
    scheduled = true;
    requestAnimationFrame(()=>{ scheduled = false; apply(document.body); });
  }

  function startObserver(){
    if(!('MutationObserver' in window) || !document.body) return;
    const obs = new MutationObserver((muts)=>{
      if(applying || lang!=='zh') return;
      schedule();
    });
    obs.observe(document.body, { subtree:true, childList:true, characterData:true });
  }

  async function set(l){
    lang = (l==='zh') ? 'zh' : 'en';
    try{ localStorage.setItem(STORE, lang); }catch(e){}
    document.documentElement.lang = lang==='zh' ? 'zh-CN' : 'en';
    // Re-render the current route from the English source, then (if zh) translate.
    try{ if(MKR.router && MKR.router.render) await MKR.router.render(); }catch(e){}
    if(lang==='zh') apply(document.body);
  }

  // Small EN | 中 switch markup (used by login + settings)
  function switcher(){
    return `<div class="lang-switch" role="group" aria-label="Language">
      <button type="button" data-lang="en" class="${lang==='en'?'active':''}">EN</button>
      <button type="button" data-lang="zh" class="${lang==='zh'?'active':''}">中</button>
    </div>`;
  }
  // Wire up any rendered switchers within `root`
  function bindSwitchers(root){
    (root||document).querySelectorAll('.lang-switch [data-lang]').forEach(b=>{
      b.onclick = ()=> set(b.dataset.lang);
    });
  }

  MKR.i18n = { get lang(){ return lang; }, set, t:tr, apply, switcher, bindSwitchers };

  document.documentElement.lang = lang==='zh' ? 'zh-CN' : 'en';
  startObserver();
  if(lang==='zh') apply(document.body);
})();
