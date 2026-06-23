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
    "Dashboard":"工作台", "AI Assistant":"全能助手", "Daily report":"每日报告", "Alerts":"提醒", "Audit log":"审计日志",
    "Labor cost":"人力成本", "Team":"团队", "Super Admin":"超级管理员", "Compliance":"合规",
    // Mobile bottom-nav short labels
    "Dash":"工作台", "Report":"报告", "Audit":"审计", "Labor":"人力", "Comply":"合规",
    "Reviews":"评价", "Switch":"切换", "Settings":"设置", "Branches":"分店",
    // Sold-out / 86
    "⛔ Sold out":"⛔ 沽清", "↩︎ Back in stock":"↩︎ 恢复供应", "Sold out":"沽清",
    // Bookings & queue
    "Bookings":"预订", "Bookings & queue":"预订与排队",
    "Table reservations and the live walk-in waitlist":"桌位预订与实时叫号排队",
    "📅 Upcoming bookings":"📅 即将到店", "⏳ Waiting now":"⏳ 当前等位", "🔔 Called":"🔔 已叫号",
    "📅 Reservations":"📅 桌位预订", "⏳ Walk-in queue":"⏳ 叫号排队",
    "＋ New booking":"＋ 新建预订", "＋ Add to queue":"＋ 加入排队", "Add to queue":"加入排队",
    "No upcoming bookings":"暂无即将到店预订", "Queue is empty":"排队为空",
    "Seat":"入座", "No-show":"未到", "🔔 Call":"🔔 叫号", "Left":"离开", "Today":"今天",
    "New booking":"新建预订", "Guest name":"客人姓名", "Party size":"人数",
    "Note (optional)":"备注（可选）", "Add booking":"添加预订", "e.g. window seat, birthday":"例如：靠窗、生日",
    "Name (optional)":"姓名（可选）", "Walk-in name":"到店客人姓名", "Optional · for SMS":"可选 · 用于短信",
    "Booking added":"预订已添加", "Called":"已叫号", "Seated":"已入座", "Removed from queue":"已移出排队",
    "Seated booking":"已为预订入座", "Marked no-show":"已标记未到", "Cancelled booking":"已取消预订",
    // Audit search
    "Search actions, people, details…":"搜索操作、人员、详情…", "No matching actions":"无匹配的操作", "No actions recorded yet":"暂无操作记录",
    // Inventory
    "Inventory":"库存", "Stock":"库存", "Inventory & stock":"库存与备货",
    // Alerts auto-clean
    "Auto-clear after":"超过此天数自动清理", "Never":"不清理", "3 days":"3 天", "7 days":"7 天", "14 days":"14 天", "30 days":"30 天",
    "🗑️ Clear read":"🗑️ 清除已读", "Auto-clear setting saved":"自动清理设置已保存",
    "Clear read alerts":"清除已读提醒", "Delete all alerts already marked read?":"删除所有已标为已读的提醒？", "Clear":"清除",
    // Owner-page feature toggles (Settings)
    "Owner · AI Assistant":"老板 · 全能助手", "Owner · Analytics":"老板 · 经营分析", "Owner · Labor cost":"老板 · 人力成本",
    "Owner · Team":"老板 · 团队", "Owner · Performance":"老板 · 绩效", "Owner · Membership":"老板 · 会员",
    "Owner · Branches":"老板 · 分店", "Owner · Feedback":"老板 · 顾客反馈",
    // Audit action labels (new)
    "Sold-out change":"沽清调整", "Booking update":"预订更新", "New member":"新会员",
    "Member top-up":"会员充值", "Adjust points":"调整积分", "Issue coupon":"发放优惠券", "Staff reward":"员工奖励",
    // Refund approval
    "Manager approval":"经理审批", "Manager username":"经理用户名", "Manager password":"经理密码",
    "Approve refund":"批准退款", "Wrong manager username or password":"经理用户名或密码错误",
    // Receipt
    "Receipt":"小票", "🖨️ Print / Save PDF":"🖨️ 打印 / 存为 PDF", "Done":"完成",
    "Tax invoice (indicative)":"税务发票（参考）", "Total":"合计",
    "Cash":"现金", "Card":"刷卡", "Stored value":"储值", "Paid":"已付",
    "Thank you — see you again!":"谢谢惠顾，欢迎再来！",
    // CSV export
    "⬇️ Export orders (CSV)":"⬇️ 导出订单 (CSV)", "⬇️ Export members":"⬇️ 导出会员", "⬇️ Export wages":"⬇️ 导出工资",
    "Orders exported":"订单已导出", "Members exported":"会员已导出", "Wages exported":"工资已导出",
    "No orders today to export":"今日无订单可导出", "No members to export":"暂无会员可导出", "No rostered shifts to export":"暂无排班可导出",
    // Customer self-service rewards (#/points)
    "⭐ My rewards":"⭐ 我的会员", "Look up my rewards":"查询我的会员权益",
    "⭐ Points":"⭐ 积分", "💰 Balance":"💰 余额", "🎟️ My coupons":"🎟️ 我的优惠券",
    "No active coupons":"暂无可用优惠券", "Looking…":"查询中…", "Not available offline":"离线不可用",
    "This feature isn’t enabled yet — please ask staff.":"此功能尚未开启 —— 请咨询店员。",
    "No member found for that phone or code.":"未找到该电话或编号对应的会员。",
    "Show this screen at the counter, or give your phone number when you order.":"在柜台出示此页，或点餐时报手机号即可。",
    "Feedback":"顾客反馈", "Switch view":"切换视图", "Settings":"设置",
    "Rostering":"排班", "Add Users":"添加员工", "Menu & Items":"菜单与菜品",
    "Tasks":"任务", "Swaps / SOS":"换班 / SOS", "POS":"收银", "Kitchen":"后厨", "Table QR":"桌台二维码",
    "My shifts":"我的班次", "Availability":"可用时间", "Today's tasks":"今日任务",
    "Swap market":"换班市场", "My profile":"我的资料",
    "Log out":"退出登录", "Connected":"已连接", "+ shift":"+ 班次",

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
    "Live ›":"实时 ›", "Not reconciled ›":"未对账 ›", "Normal ›":"正常 ›",
    "Over threshold ›":"超阈值 ›", "View report ›":"查看报告 ›", "orders":"单",
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
    "Offboarded staff records are not deleted — per Australian audit requirements they are encrypted and retained for 7 years; sensitive fields like TFN remain owner-only.":"离职员工记录不会被删除 —— 按澳大利亚审计要求加密保存 7 年；TFN 等敏感字段仅老板可见。",
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

    // ---- Batch-1 additions: live dashboard, roster compliance, new charts ----
    "🟢 On shift now":"🟢 当前在岗", "Busiest 15-min":"最忙 15 分钟",
    "Visa-hours breach — must fix before publishing":"签证工时超标 —— 发布前必须修正",
    "Best-seller trend · 14 days":"热卖趋势 · 14 天", "Foot traffic by hour · 30 days":"分时客流 · 30 天",

    // ---- Batch-2: phone-pairing join + manager approval ----
    "Request to join the team":"申请加入团队",
    "🧑‍🍳 Joining a team? Request to join by phone →":"🧑‍🍳 想加入团队？用手机号申请 →",
    "Your name":"你的姓名", "Phone number":"电话号码", "Choose a password":"设置密码",
    "🙋 Join requests · approval needed":"🙋 加入申请 · 待审批",
    "Approve phone join requests, or add a new starter directly by phone":"审批手机加入申请，或直接用手机号添加新员工",
    "✅ Request sent":"✅ 申请已提交",
    "Reject request":"驳回申请", "Reject and remove this join request?":"驳回并删除此加入申请？",
    "Approved — they can sign in now":"已批准 —— 对方现在可以登录", "Request rejected":"申请已驳回",
    "Join request approved":"加入申请已批准",

    // ---- Analytics ----
    "Analytics":"经营分析",
    "What's making money — last 30 days of sales, sellers and patterns":"看清赚钱点 — 近 30 天的销售、热卖与规律",
    "Revenue (30 days)":"营业额（30 天）", "Orders (30 days)":"订单（30 天）", "Busiest period":"最旺时段",
    "Revenue · last 14 days":"营业额 · 近 14 天",
    "Top sellers · 30 days":"热卖榜 · 30 天", "Slow movers":"滞销品",
    "Revenue by time of day":"各时段营业额", "Payment mix":"支付方式占比",
    "Morning":"早市", "Lunch":"午市", "Afternoon":"下午", "Dinner":"晚市", "Late night":"夜宵",
    "Avg order value":"客单价",
    "Figures cover paid orders across your venues for the last 30 days. Use them to plan menu, staffing and promotions — they don't constitute financial advice.":"数据涵盖近 30 天各门店的已付订单，可用于菜单、排班与促销规划 — 不构成财务建议。",

    // ---- Branches (multi-venue) ----
    "Branches":"分店",
    "All your venues at a glance — compare today's performance, then switch in to manage one":"一览你的所有门店 — 对比今日业绩，点进去管理单店",
    "＋ Add branch":"＋ 添加分店", "Add branch":"添加分店", "Add a branch":"添加分店",
    "Revenue today (all)":"今日营业额（全部）", "Orders today (all)":"今日订单（全部）", "People (all)":"员工（全部）",
    "Revenue today by branch":"各分店今日营业额", "No branches yet":"暂无分店",
    "Current":"当前", "Top today":"今日最佳", "Branch name":"分店名称",
    "Adds a new venue you own. Switch to it to set up its team, menu and features.":"新增一家你拥有的门店。切换进去即可设置其团队、菜单与功能。",
    "Branch added — switch to it to set it up":"分店已添加 — 切换进去进行设置",
    "Switching a branch changes which venue's team, menu and settings you manage. The current branch is highlighted and its logo/name shows on the sign-in page.":"切换分店会改变你管理的门店（团队、菜单与设置）。当前分店会高亮，其 logo / 名称显示在登录页。",

    // ---- Rostering extras ----
    "· shift slots:":"· 班次时段：",
    "Award pay auto-calculated":"工资按行业标准自动计算",
    "· split by age + employment type across weekday / Saturday / Sunday / public holiday.":"· 按年龄 + 雇佣类型，分平日 / 周六 / 周日 / 公共假期计算。",
    "Indicative — the employer confirms before pay runs.":"仅供参考 —— 发薪前由雇主确认。",

    // ---- Table QR ----
    "Guests scan to open":"顾客扫码打开",
    "; orders flow live into the kitchen KDS. Print and stick a code on every table.":"；订单实时进入后厨 KDS。请为每张桌子打印并张贴二维码。",
    "Table":"桌号",

    // ---- Staff onboarding extras ----
    "Before your first shift, please complete the required documents below:":"首班之前，请完成以下必需文件：",
    "Passport":"护照", "and":"和", "Super choice":"养老金选择", "TFN declaration":"TFN 申报",
    "Upload a photo of your passport or ID":"上传护照或证件照片",
    "Enter your Tax File Number + declaration":"填写你的税号 TFN + 申报",
    "Choose your super fund / upload the form":"选择养老金账户 / 上传表格",
    "Add your BSB + account (for pay)":"添加 BSB + 账号（用于发薪）",
    "Complete required documents first":"请先完成必需文件",
    "Uploaded · encrypted":"已上传 · 已加密",
    "Submitted · encrypted (owner-only)":"已提交 · 已加密（仅老板可见）",
    "📷 Photo":"📷 照片",

    // ---- Login: apply for a restaurant ----
    "Apply for a new restaurant system":"申请开通新餐厅系统",
    "Apply to run your restaurant on My Kitchen. Only business owners may apply — a Super Admin reviews every request before your system is provisioned.":"申请在 My Kitchen 上运营你的餐厅。仅店主可申请 —— 超级管理员会先审核每个请求再开通系统。",
    "Restaurant name":"餐厅名称", "Restaurant address":"餐厅地址", "Website (optional)":"网站（可选）",
    "Contact phone":"联系电话", "Contact email":"联系邮箱",
    "Owner login (for after approval)":"店主登录（审批通过后使用）",
    "Choose a username":"设置用户名", "Choose a password":"设置密码",
    "📩 Submit application":"📩 提交申请", "Submitting…":"提交中…",
    "Application submitted!":"申请已提交！", "Your login username":"你的登录用户名", "Status":"状态",
    "Pending approval":"待审批", "Restaurants on My Kitchen":"My Kitchen 上的餐厅",
    "Your application is still pending approval":"你的申请仍在等待审批",
    "Your restaurant is still pending approval":"你的餐厅仍在等待审批",
    "Wrong username/email or password":"用户名 / 邮箱或密码错误",
    "Wrong Super Admin password":"超级管理员密码错误",

    // ---- Super Admin portal ----
    "System administrator — approve venues & oversee every restaurant":"系统管理员 —— 审批门店并监管所有餐厅",
    "Applications":"申请", "Restaurants":"餐厅",
    "Restaurant applications":"餐厅申请",
    "Review and approve new restaurants before their system is provisioned":"在开通系统前审核并批准新餐厅",
    "⏳ Pending approval":"⏳ 待审批", "Recently decided":"近期已处理",
    "No pending applications":"暂无待审批申请", "Nothing decided yet":"暂无处理记录",
    "✓ Approve":"✓ 批准", "Reject":"驳回", "Rejected":"已驳回",
    "Approved & provisioned — the owner can now sign in":"已批准并开通 —— 店主现在可以登录了",
    "Application rejected":"申请已驳回", "Reject application":"驳回申请",
    "All restaurants":"所有餐厅",
    "Global visibility across every venue (tenant), their users and configuration":"全局查看每个门店（租户）及其用户与配置",
    "＋ Create restaurant":"＋ 创建餐厅", "🏢 Restaurants":"🏢 餐厅", "⏳ Pending":"⏳ 待审批",
    "Each restaurant is an isolated tenant. You have full visibility into every venue's users, data and configuration here.":"每个餐厅都是独立租户。你在此可全面查看每个门店的用户、数据与配置。",
    "Create a restaurant":"创建餐厅", "Create (active)":"创建（启用）", "Restaurant created":"餐厅已创建",
    "Step into any restaurant and see exactly what its owner, manager or staff see":"进入任意餐厅，查看其店主 / 经理 / 员工所见的界面",
    "A banner at the top lets you return to the Super Admin console at any time.":"顶部横幅可让你随时返回超级管理员控制台。",
    "No active restaurants":"暂无已启用的餐厅",
    "👁 Enter as…":"👁 以…身份进入", "Approve & provision":"批准并开通",
    "← Back to restaurants":"← 返回餐厅列表",
    "Hierarchy & unique IDs":"层级与唯一 ID", "⚙️ Configuration snapshot":"⚙️ 配置快照",
    "Setup complete":"已完成设置", "Contact":"联系方式", "Status":"状态",

    // ---- Owner: setup wizard ----
    "1 · Restaurant logo":"1 · 餐厅 Logo", "2 · Choose your features":"2 · 选择功能",
    "Your logo appears on the sign-in page and in every portal.":"你的 Logo 会显示在登录页和各个端。",
    "🏪 Restaurant profile":"🏪 餐厅资料",
    "Your logo and name appear in the sidebar, on the sign-in page and across every portal.":"你的 Logo 和名称会显示在侧边栏、登录页以及各个端。",
    "📷 Tap to upload":"📷 点击上传", "Your restaurant name":"你的餐厅名称",
    "Save profile":"保存资料", "Remove logo":"移除 Logo",
    "Restaurant profile saved":"餐厅资料已保存",
    "Image too large — please use one under 2 MB":"图片过大 —— 请使用 2 MB 以内的图片",
    "Display name":"显示名称",
    "Tick the modules you want. Unticked ones are hidden from your team.":"勾选你需要的模块，未勾选的将对团队隐藏。",
    "✅ Finish setup":"✅ 完成设置",
    "You can revisit Settings anytime to toggle features or switch language.":"你可随时在「设置」中开关功能或切换语言。",
    "Setup complete — welcome aboard! 🎉":"设置完成 —— 欢迎加入！🎉",

    // ---- Owner: team & roles ----
    "Your managers and staff · tap anyone to open their profile or change their role":"你的经理与员工 · 点击任意成员查看资料或调整身份",
    "🔗 Manager join link":"🔗 经理加入链接", "👥 Total people":"👥 总人数",
    "No managers yet — share the join link":"暂无经理 —— 分享加入链接",
    "Invite a manager":"邀请经理", "Manager join link":"经理加入链接", "Copy link":"复制链接", "Join link copied":"加入链接已复制",
    "Share this link with a manager. They open it, create their login, and instantly join this restaurant.":"把此链接发给经理。他们打开后创建登录账号，即可立即加入本餐厅。",
    "Change role":"调整身份", "Save role":"保存身份",
    "Change role":"调整身份",

    // ---- Manager join page ----
    "Join the team":"加入团队", "Invalid invite link":"邀请链接无效",
    "Your name":"你的姓名",
    "This invite link is invalid or the restaurant isn't active yet. Please check with the owner.":"此邀请链接无效，或餐厅尚未启用。请与店主确认。",
    "← Back to sign in":"← 返回登录",
    "Go to sign in":"前往登录",

    // ---- Pay rate settings (owner-configurable) ----
    "⚙️ Pay rates":"⚙️ 薪资费率", "Pay rate settings":"薪资费率设置", "Save rates":"保存费率", "Pay rates saved":"薪资费率已保存",
    "Set the award multipliers used for indicative wage calculations across rostering, labor cost and compliance. The employer still confirms before pay runs.":"设置用于排班、人力成本与合规中工资参考计算的 Award 费率。发薪前仍由雇主确认。",
    "Day-type rates":"按日类型费率", "Weekday (Mon–Fri)":"平日（周一至周五）", "Public holiday":"公众假期",
    "Saturday":"周六", "Sunday":"周日",
    "Junior rates (share of adult rate by age)":"未成年费率（按年龄占成人费率比例）",
    "Age 16 & under":"16 岁及以下", "Age 17":"17 岁", "Age 18":"18 岁", "Age 19":"19 岁", "Age 20":"20 岁",
    "Age 21+ is paid the full adult rate (100%).":"21 岁及以上按成人全额费率（100%）计算。",

    // ---- Rostering stat detail modals ----
    "on the roster · view ›":"在排班中 · 查看 ›", "indicative · breakdown ›":"参考值 · 明细 ›",
    "This week's wages":"本周工资", "Total (indicative)":"合计（参考）",
    "Award-based indicative figures; the employer confirms before pay runs.":"基于 Award 的参考数字；发薪前由雇主确认。",
    "Labor cost ratio":"人力成本占比", "Rostered wages (this week)":"本周排班工资", "Forecast revenue":"预测营业额",
    "Labor ratio":"人力占比", "Red line":"红线",
    "Over the red line — synced to the owner for approval.":"超出红线 —— 已同步给老板审批。",
    "Within the healthy range.":"在健康范围内。",
    "Student-visa hours":"学生签证工时", "No student-visa staff":"暂无学签员工",
    "No shifts rostered":"暂无排班", "No staff yet":"暂无员工",

    // ---- Blind drop: open + close ----
    "Cash count":"现金清点", "🌅 Opening float":"🌅 开店备用金", "🌙 Closing count":"🌙 打烊清点",
    "Enter note / coin counts (tap ± or type)":"录入纸币 / 硬币数量（点 ± 或直接输入）",
    "Opening float total":"开店备用金合计", "Blind-counted total":"盲点合计",
    "Count the cash going into the drawer to start the day — recorded as today's opening float (no comparison).":"清点开店放入钱箱的现金 —— 记录为今日开店备用金（不做比对）。",
    "The expected total is hidden. Blind-count the drawer cash; the system compares it and generates a variance report.":"应收金额已隐藏。请盲点钱箱现金；系统会比对并生成差异报告。",
    "Submit":"提交", "Opening float recorded":"开店备用金已记录",
    "At close, run the closing count to reconcile the drawer.":"打烊时，运行打烊清点以对账钱箱。",
    "Reconciliation result":"对账结果",

    // ---- KDS serving time ----
    "⏱ Serving time":"⏱ 出餐时间", "KDS serving time":"KDS 出餐时间",
    "Set how long an order can wait before the kitchen ticket warns (amber) and then flags overdue (red). No fixed default — tune it to your kitchen.":"设置订单等待多久后出单变橙（提醒）、再变红（超时）。无固定默认值 —— 按你的后厨调整。",
    "Warn after (min)":"提醒阈值（分钟）", "Overdue / red after (min)":"超时变红（分钟）", "Serving time saved":"出餐时间已保存",

    // ---- Staff: own sensitive info ----
    "Your TFN is encrypted at rest. You can see your own here; for other staff, only the owner can reveal it (Privacy Act TFN Rule).":"你的 TFN 静态加密存储。你可在此查看自己的；其他员工的仅老板可查看（隐私法 TFN 规则）。",
    "All set — your documents are encrypted and stored. Tap any item above to view or update.":"已就绪 —— 你的文件已加密存储。点击上方任一项即可查看或更新。",

    // ---- AI assistant ----
    "🤖 Assistant":"🤖 智能助手", "Ask about a feature or your shifts…":"问我功能或你的班次…",
    "What are my shifts?":"我的班次是？", "How many hours this week?":"本周多少工时？",
    "My pay estimate":"我的薪资预估", "How do I clock in?":"怎么打卡？", "My TFN":"我的税号 TFN",
    "How do I roster the team?":"怎么给团队排班？", "How do I add a user?":"怎么添加员工？",
    "This week's wages":"本周工资", "Post an SOS cover":"发布 SOS 补班",
    "Today's revenue":"今日营业额", "How many staff?":"有多少员工？", "Add a branch":"添加分店",
    "Set pay rates":"设置薪资费率", "How does compliance work?":"合规怎么用？",
    "Pending applications":"待审批申请", "How do I approve a restaurant?":"怎么审批餐厅？",
    "Switch into a venue":"进入某个门店", "How do I sign in?":"怎么登录？",
    "What is this app?":"这个系统是什么？", "Switch to 中文":"切换到中文",

    // ---- Manager: My shifts ----
    "My shifts":"我的班次",
    "Your own roster · clock in on the day · add a shift for yourself":"你的个人排班 · 当天打卡 · 可为自己加班次",
    "＋ Add my shift":"＋ 为我加班次", "Add my shift":"为我加班次",
    "No shifts rostered for you this week — tap “Add my shift”.":"本周暂无你的排班 —— 点「为我加班次」。",
    "The owner can also place your shifts. Anything here syncs with the team roster.":"老板也可为你排班。此处的改动会与团队排班同步。",
    "Shift added to your roster":"班次已加入你的排班", "Day":"星期",

    // ---- Owner: Branches ----
    "Branches":"分店",
    "Your venues — add a new branch and switch between them to manage each one":"你的门店 —— 添加新分店并在它们之间切换以分别管理",
    "＋ Add branch":"＋ 添加分店", "Add a branch":"添加分店", "Add branch":"添加分店",
    "🏢 Branches":"🏢 分店", "📍 Current":"📍 当前", "👥 People (current)":"👥 人数（当前）",
    "Current":"当前", "Branch name":"分店名称",
    "No branches yet":"暂无分店",
    "Switching a branch changes which venue's team, menu and settings you manage. Your current branch is highlighted and its logo/name shows on the sign-in page.":"切换分店会改变你所管理门店的团队、菜单与设置。当前分店会高亮，其 Logo/名称会显示在登录页。",
    "Adds a new venue you own. Switch to it to set up its team, menu and features.":"添加一个你拥有的新门店。切换到它即可设置其团队、菜单与功能。",
    "Branch added — switch to it to set it up":"分店已添加 —— 切换过去即可设置",

    // ---- Owner: Staff performance points (Batch 3) ----
    "Performance":"绩效", "Perform":"绩效",
    "Staff performance":"员工绩效",
    "Auto points from orders served, on-time clock-ins and tasks — minus refunds/cancels. Reward your top performers.":"根据出餐数、准时打卡和完成任务自动累积积分 —— 退款/取消会扣分。奖励你的优秀员工。",
    "⚙️ Points settings":"⚙️ 积分设置", "Points settings":"积分设置",
    "Points are an internal incentive metric over the last 30 days — not a formal performance review.":"积分是过去 30 天的内部激励指标 —— 并非正式绩效考核。",
    "No staff yet":"暂无员工",
    "Points per order served":"每出一单积分", "Points per on-time clock-in":"每次准时打卡积分",
    "Points per task done":"每完成一项任务积分", "Penalty per refund / cancel":"每次退款/取消扣分",
    "Points settings saved":"积分设置已保存",
    "🎁 Reward":"🎁 奖励", "Reward":"奖励", "Give reward":"发放奖励",
    "Reward / recognition":"奖励 / 表彰",
    "e.g. $50 bonus · Employee of the month":"例如：$50 奖金 · 月度最佳员工",
    "Enter a reward":"请填写奖励内容", "Reward recorded 🎁":"奖励已记录 🎁",
    "rewarded":"已奖励", "Bonus points (optional)":"奖励积分（可选）",

    // ---- Owner: Membership / loyalty / coupons (Batch 4) ----
    "Membership":"会员", "Members":"会员",
    "🪪 Members":"🪪 会员", "🔁 Repurchase rate":"🔁 复购率",
    "⭐ Points outstanding":"⭐ 未兑积分", "💰 Stored value":"💰 储值余额",
    "⚙️ Loyalty settings":"⚙️ 会员设置", "Loyalty settings":"会员积分设置", "Loyalty settings saved":"会员设置已保存",
    "🔁 Frequently bought together":"🔁 常一起购买", "💎 Top members by spend":"💎 消费最高会员",
    "Not enough order history yet":"订单数据不足", "No members yet":"暂无会员", "No coupons yet":"暂无优惠券",
    "🎟️ Coupons":"🎟️ 优惠券", "＋ Issue coupon":"＋ 发放优惠券",
    "🪪 Members":"🪪 会员", "Search name / phone / code":"搜索 姓名 / 电话 / 编号",
    "No members yet — add them at checkout in POS":"暂无会员 —— 在 POS 收银台结账时添加",
    "Points earned per $1 spent":"每消费 $1 获得积分", "Redemption value — cents per point":"兑换价值 —— 每积分多少分",
    "1 = 100 pts worth $1":"1 = 100 积分价值 $1", "Sign-up bonus points":"注册赠送积分",
    "Issue coupons":"发放优惠券", "Issue member coupon":"发放会员优惠券", "Issue":"发放",
    "% off":"% 折扣", "$ off":"$ 折扣", "Percent off":"折扣百分比", "Amount off ($)":"减免金额（$）",
    "Minimum spend (optional)":"最低消费（可选）", "Expiry date (optional)":"有效期（可选）", "How many codes":"生成数量",
    "Points":"积分", "Balance":"余额", "Visits":"到店次数", "Spent":"累计消费",
    "💰 Top up":"💰 充值", "⭐ Adjust points":"⭐ 调整积分", "🎟️ Give coupon":"🎟️ 赠送优惠券",
    "Recent activity":"近期记录", "No activity yet":"暂无记录",
    "Top-up amount":"充值金额", "Add to balance":"充入余额", "Enter an amount":"请输入金额",
    "Points (use − to deduct)":"积分（用 − 扣除）", "e.g. goodwill, correction":"例如：好评回馈、修正",
    "Points adjusted":"积分已调整", "Topped up":"充值成功",
    "Active":"有效", "Used":"已使用", "public":"公开",
    // ---- POS: member checkout / coupons ----
    "👤 Add member · phone or QR":"👤 添加会员 · 电话或二维码", "Coupon":"优惠券", "Points redeemed":"积分抵扣",
    "🎟️ Coupon":"🎟️ 优惠券", "⭐ Redeem points":"⭐ 积分抵扣", "💰 Balance":"💰 余额",
    "Add member":"添加会员", "Phone or member code":"电话或会员编号", "Phone or member QR code":"电话或会员二维码",
    "Member name":"会员姓名", "Create member":"创建会员", "Member added":"会员已添加", "New member created":"新会员已创建",
    "Insufficient balance":"余额不足", "Apply coupon":"使用优惠券", "Coupon code":"优惠券码", "Coupon applied":"优惠券已使用",
    "Redeem points":"积分抵扣", "No member found.":"未找到会员。",
    "No such coupon":"优惠券不存在", "Coupon already used":"优惠券已使用", "Coupon expired":"优惠券已过期",
    "Coupon belongs to another member":"该优惠券属于其他会员",
  };

  // Templated strings (numbers / names interpolated) — exact match can't catch
  // these, so match by pattern and re-insert the captured dynamic bits.
  const PATTERNS = [
    [/^(\d+) reviews$/, "$1 条评价"],
    [/^(\d+) orders? today · live$/, "今日 $1 单 · 实时"],
    [/^(\d+) active · (\d+) total$/, "$1 在职 · 共 $2 人"],
    [/^🔒 Append-only · (\d+) entries$/, "🔒 仅追加 · 共 $1 条"],
    [/^Append-only · (\d+) entries$/, "仅追加 · 共 $1 条"],
    [/^Aggregates staff fridge-temperature logs and hygiene tasks into a Council food-safety audit format\. Today: (\d+)\/(\d+) logged\.$/, "汇总员工冰箱测温记录与卫生任务，生成市政食品安全审计格式。今日：已记录 $1/$2。"],
    [/^Student visa · fortnight cap (\d+)h$/, "学生签证 · 两周上限 $1h"],
    [/^([\d.]+ h) this week$/, "本周 $1"],
    // Staff list / overview rows (embedded id + data) — translate the label parts.
    [/^· onboarded$/, "· 已入职"],
    [/^· pending$/, "· 待入职"],
    [/^ID (\S+) · (.+?) · student visa$/, m => `ID ${m[1]} · ${tr(m[2])} · 学生签证`],
    [/^ID (\S+) · (.+?) · (onboarded|pending)$/, m => `ID ${m[1]} · ${tr(m[2])} · ${m[3]==='onboarded'?'已入职':'待入职'}`],
    [/^(.+?) · (\d+) shifts?$/, m => `${tr(m[1])} · ${m[2]} 个班次`],
    // New-feature templated strings
    [/^Total staff · (\d+)$/, "员工总数 · $1"],
    [/^Your TFN: (.+)$/, "你的 TFN：$1"],
    [/^Student-visa hours are hard-capped at (\d+)h\/fortnight to protect employer compliance\.$/, "学生签证工时硬性封顶为每两周 $1 小时，以保障雇主合规。"],
    [/^Opening float (\$[\d,]+\.\d{2}) recorded for (.+)\.$/, m => `开店备用金 ${m[1]} 已记录于 ${m[2]}。`],
    // Audit log: "<action label> · $<amount>"
    [/^(.+?) · (\$[\d,]+\.\d{2})$/, m => `${tr(m[1])} · ${m[2]}`],
    // Compliance super reminder: "est. at X% · due YYYY-MM-DD"
    [/^est\. at ([\d.]+%) · due (.+)$/, m => `预计 ${m[1]} · 截止 ${m[2]}`],
    // Super Admin kitchen row: "<loc> · N manager(s) · M staff · ID xxx"
    [/^(.+) · (\d+) manager\(s\) · (\d+) staff · ID (.+)$/, m => `${m[1]} · ${m[2]} 名经理 · ${m[3]} 名员工 · ID ${m[4]}`],
    // Labor cost
    [/^red line ([\d.]+%)$/, "红线 $1"],
    [/^You approved this week's roster on (.+)\.$/, m => `你已于 ${m[1]} 批准本周排班。`],
    // Daily report summary line
    [/^Today's revenue (.+) across (\d+) orders; cash variance (.+); tomorrow (\d+) bookings\.$/,
      m => `今日营业额 ${m[1]}，共 ${m[2]} 单；现金差异 ${m[3]==='not reconciled'?'未对账':m[3]}；明日 ${m[4]} 桌预订。`],
    // KDS ticket / QR / rostering / onboarding companions
    [/^#(\w+) · table (.+)$/, m => `#${m[1]} · 桌 ${m[2]}`],
    [/^Table (\d+)$/, "桌 $1"],
    [/^🛂 Student-visa hours \(\/(\d+)h\)$/, "🛂 学生签证工时（/$1h）"],
    [/^Morning (\d\d:\d\d-\d\d:\d\d)$/, "早班 $1"],
    [/^Evening (\d\d:\d\d-\d\d:\d\d)$/, "晚班 $1"],
    [/^Welcome aboard, (.*)!$/, m => `欢迎加入，${m[1]}！`],
    [/^(\d+)\/(\d+) required$/, "$1/$2 项必需"],
    [/^Passport \/ TFN are encrypted \((AES-GCM|local cipher)\) and can only be revealed by the owner\. This system aggregates data only and does not file with the ATO\.$/,
      m => `护照 / TFN 已加密（${m[1]}），仅老板可查看。本系统仅汇总数据，不向 ATO 申报。`],
    // Customer self-order page
    [/^🪑 Table (.+) · self-order$/, "🪑 桌 $1 · 自助点单"],
    [/^Table (.+) · confirm order$/, "桌 $1 · 确认订单"],
    // Staff performance leaderboard rows
    [/^(\d+) orders · (\d+) on-time · (\d+) tasks · ~(\d+)m prep$/, m => `${m[1]} 单 · ${m[2]} 次准时 · ${m[3]} 项任务 · 约 ${m[4]} 分钟出餐`],
    [/^(\d+) orders · (\d+) on-time · (\d+) tasks ·$/, m => `${m[1]} 单 · ${m[2]} 次准时 · ${m[3]} 项任务 ·`],
    [/^(\d+) orders · (\d+) on-time · (\d+) tasks$/, m => `${m[1]} 单 · ${m[2]} 次准时 · ${m[3]} 项任务`],
    [/^(\d+) errors$/, "$1 个失误"],
    [/^· ~(\d+)m prep$/, "· 约 $1 分钟出餐"],
    [/^🎁 Reward (.+)$/, m => `🎁 奖励 ${m[1]}`],
    // Sold-out toasts
    [/^“(.+)” marked sold out$/, m => `“${m[1]}” 已沽清`],
    [/^“(.+)” back in stock$/, m => `“${m[1]}” 已恢复供应`],
    // Bookings & queue dynamic lines
    [/^Today (\d{2}:\d{2}) · (\d+) ppl(.*)$/, m => `今天 ${m[1]} · ${m[2]} 人${m[3]}`],
    [/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) · (\d+) ppl(.*)$/, m => `${m[1]} ${m[2]} · ${m[3]} 人${m[4]}`],
    [/^(\d+) ppl(.*) · waiting (.+)$/, m => `${m[1]} 人${m[2]} · 已等 ${m[3]}`],
    [/^Added · ticket #(\d+)$/, "已加入 · 号码 #$1"],
    // Refund approval
    [/^Refunds need a manager's approval\. Ask a manager to sign off on refunding #(\w+) \((.+)\)\.$/,
      m => `退款需经理审批。请经理确认为订单 #${m[1]}（${m[2]}）退款。`],
    [/^Refund #(\w+) · approved by (.+)$/, m => `退款 #${m[1]} · 由 ${m[2]} 批准`],
    // Customer rewards greeting
    [/^Hi (.+) — here are your rewards\.$/, m => `你好 ${m[1]} —— 这是你的会员权益。`],
    // Receipt dynamic lines
    [/^Served by (.+)$/, m => `服务员：${m[1]}`],
    [/^Discount (\d+)%$/, "折扣 $1%"],
    [/^Coupon ([A-Z0-9]+)$/, "优惠券 $1"],
    [/^Points redeemed \((\d+)\)$/, "积分抵扣（$1）"],
    [/^⭐ (.+) · \+(\d+) pts · (\d+) pts total · Balance (.+)$/, m => `⭐ ${m[1]} · +${m[2]} 分 · 共 ${m[3]} 分 · 余额 ${m[4]}`],
    [/^⭐ (.+) · (\d+) pts total · Balance (.+)$/, m => `⭐ ${m[1]} · 共 ${m[2]} 分 · 余额 ${m[3]}`],
    // Membership (Batch 4) templated strings
    [/^Loyalty points, stored value and e-coupons — plus repurchase & combo analysis\. (.+) pt \/ \$1 · 100 pts = (.+)\.$/,
      m => `会员积分、储值与电子优惠券 —— 含复购与搭配分析。每 $1 得 ${m[1]} 分 · 100 分 = ${m[2]}。`],
    [/^(\d+) returning$/, "$1 位回头客"],
    [/^· (\d+) active$/, "· $1 张有效"],
    [/^min (\$[\d,]+\.\d{2}) · (.+)$/, m => `最低 ${m[1]} · ${m[2]==='public'?'公开':m[2]}`],
    [/^member (M[A-Z0-9]{6})$/, "会员 $1"],
    [/^member (M[A-Z0-9]{6}) · exp (.+)$/, m => `会员 ${m[1]} · 到期 ${m[2]}`],
    [/^public · exp (.+)$/, "公开 · 到期 $1"],
    [/^(\d+)% off$/, "$1% 折扣"],
    [/^(\$[\d,]+\.\d{2}) off$/, "$1 折扣"],
    [/^(\d+) visits · ⭐ (\d+) pts$/, "到店 $1 次 · ⭐ $2 分"],
    [/^⭐ (\d+) pts · 💰 (.+) · (\d+) visits$/, m => `⭐ ${m[1]} 分 · 💰 ${m[2]} · 到店 ${m[3]} 次`],
    [/^⭐ (\d+) pts · 💰 (.+) · (\d+) visits · (.+)$/, m => `⭐ ${m[1]} 分 · 💰 ${m[2]} · 到店 ${m[3]} 次 · ${m[4]}`],
    [/^⭐ (\d+) pts · 💰 (.+?)( · .+)?$/, m => `⭐ ${m[1]} 分 · 💰 ${m[2]}${m[3]?' · '+m[3].replace(/^ · /,''):''}`],
    [/^(.+) will earn (\d+) points on this order$/, m => `${m[1]} 本单可获得 ${m[2]} 积分`],
    [/^Pay (.+) from balance · remaining (.+)$/, m => `用余额支付 ${m[1]} · 剩余 ${m[2]}`],
    [/^(.+) has (\d+) points · worth up to (.+) here$/, m => `${m[1]} 有 ${m[2]} 积分 · 此单最多可抵 ${m[3]}`],
    [/^Points to redeem \(max (\d+)\)$/, "抵扣积分（最多 $1）"],
    [/^No member found\. Create one with this phone\?$/, "未找到会员。用此电话创建一个？"],
    [/^Issued to member (M[A-Z0-9]{6})$/, "发放给会员 $1"],
    [/^Top up (.+)$/, m => `充值 ${m[1]}`],
    [/^Adjust points · (.+)$/, m => `调整积分 · ${m[1]}`],
    [/^Minimum spend (\$[\d,]+\.\d{2})$/, "最低消费 $1"],
    [/^Topped up (\$[\d,]+\.\d{2})$/, "已充值 $1"],
    // Owner preview banners (role name already translated inside the capture)
    [/^👁 Owner preview · (.+)$/, m => `👁 老板预览 · ${tr(m[1].trim())}`],
    [/^Owner · previewing (.+)$/, m => `老板 · 预览${tr(m[1])}`],
  ];

  function trKey(key){
    if(T[key]) return T[key];
    for(const [re, rep] of PATTERNS){
      const m = key.match(re);
      if(m) return typeof rep === 'function' ? rep(m) : key.replace(re, rep);
    }
    return null;
  }

  function tr(s){
    if(s==null) return s;
    const key = String(s).trim();
    return trKey(key) || s;
  }

  // ---- DOM translation ----
  const ATTRS = ['placeholder','title','aria-label'];
  let applying = false, scheduled = false;

  function translateTextNode(node){
    const raw = node.nodeValue;
    if(!raw) return;
    const key = raw.trim();
    if(!key) return;
    const hit = trKey(key);
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
    // setTimeout (not rAF) so translation still fires when the tab is backgrounded.
    setTimeout(()=>{ scheduled = false; apply(document.body); }, 0);
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
