/* ===== 中英双语 =====
   方案:维护「中文→English」字典 + MutationObserver 自动翻译渲染出的文字。
   好处:不用改每个页面模板,切到 EN 时自动把界面中文替换成英文(字典里有的)。
   字典里没有的词暂时保持中文(逐步补全)。动态内容(姓名/金额/数字)保持原样。
*/
window.MKR = window.MKR || {};
(function(){
  const DICT = {
    // —— 登录 / 通用 ——
    "餐厅全能管家 · 安全登录":"Restaurant manager · Secure login","老板":"Owner","经理":"Manager","员工":"Staff",
    "账号":"Username","密码":"Password","登录":"Sign in","登录中…":"Signing in…","加载数据…":"Loading…",
    "演示账号(点角色自动填充):":"Demo accounts (tap a role to fill):",
    "每个账号独立、数据库按角色隔离;离职后立即失效。":"Each account is separate, isolated by role; access revoked instantly on offboarding.",
    "退出登录":"Log out","保存":"Save","取消":"Cancel","确认":"Confirm","关闭":"Close","删除":"Delete","提交":"Submit",
    "保存设置":"Save settings","保存资料":"Save profile","编辑资料":"Edit profile","返回团队":"Back to team","已连接云端":"Cloud connected","已连接":"Connected","已连接(本地)":"Connected (local)",
    "本地保护模式":"Offline-safe mode","同步中":"Syncing",
    // —— 端 ——
    "老板端":"Owner","经理端":"Manager","员工端":"Staff","前台收银 · POS":"POS",
    "睡后管理 · 只看结果、只做审批":"Hands-off management — results & approvals only",
    "执行业务与带团队 · 排班 / 招人 / 审核":"Run operations & lead the team",
    "傻瓜化执行 · 看班 / 打卡 / 抢单":"Simple execution — shifts / clock-in / claim",
    // —— 老板导航 / 页面 ——
    "核心看板":"Dashboard","每日日报":"Daily report","红色警报":"Alerts","操作审计":"Audit log","人工成本":"Labor cost",
    "团队管理":"Team","合规守护":"Compliance","顾客反馈":"Feedback","切换视图":"Switch view","系统设置":"Settings",
    "系统平时静默运行,出问题才打扰你":"Runs quietly; only pings you when something's wrong",
    "今日营业额":"Today's revenue","盲对账差异":"Blind-drop variance","今日订单":"Today's orders","未读警报":"Unread alerts",
    "实时统计":"Live","今日未对账":"Not reconciled","正常":"Normal","超阈值":"Over threshold","查看日报":"View report",
    "需关注":"Needs attention","一切正常":"All good","已收款":"Paid","红色警报 · 只在出事时打扰":"Alerts · only when it matters",
    "今日速览":"Today at a glance","完整日报":"Full report","现金盲对账差异":"Cash blind-drop variance","明日预订(示例)":"Tomorrow's bookings (demo)",
    "暂无异常,系统静默运行中":"No issues — running quietly",
    "每日智能日报":"Daily smart report","打烊后自动推送一条极简日报到你手机,无需登录即可掌握全局":"Auto-pushed at close — the whole picture without logging in",
    "异常红色警报":"Critical alerts","盲对账差异超标 / 大额退款 / 员工迟到等才会推送":"Only fires on variance / big refunds / lateness",
    "全部标为已读":"Mark all read","标记已读":"Mark read","已读":"Read","暂无任何警报,一切正常":"No alerts — all good",
    "敏感操作审计":"Sensitive-action audit","改单 / 取消 / 打折 / 退款全程留痕 · 只追加不可篡改":"Edits / cancels / discounts / refunds — append-only, tamper-proof",
    "审计日志采用只追加(append-only)结构,系统不提供任何删除或修改入口。":"Audit log is append-only — no delete or edit path exists.",
    "人工成本审批":"Labor cost approval","系统预测下周营业额与人工费占比,超标自动弹红色预警":"Forecasts next week's labor ratio and flags overruns",
    "下周预估营业额":"Forecast revenue (next week)","排班总薪资(参考)":"Rostered wages (ref.)","人工费占比":"Labor ratio",
    "一键审批通过":"Approve","驳回 · 要求调整":"Reject · request changes","本周排班成本审批":"Approve this week's roster cost",
    // —— 团队 / 员工档案 ——
    "点员工打开完整档案 · 可编辑电话/邮箱/护照/签证/合同/银行/TFN":"Tap a staff member for the full profile (editable)",
    "在职":"Active","已离职":"Offboarded","基本信息":"Basic info","签证与合规":"Visa & compliance","薪资 · 银行 · 税务":"Pay · Bank · Tax","离职归档":"Offboard archive",
    "职位":"Position","工时类型":"Employment","年龄":"Age","电话":"Phone","邮箱":"Email","入职日期":"Start date","住址":"Address","紧急联系人":"Emergency contact","可上班时间":"Availability",
    "签证类型":"Visa type","签证到期":"Visa expiry","双周工时":"Fortnight hours","合同类型":"Contract type","护照号":"Passport no.",
    "基本时薪(参考)":"Base rate (ref.)","Super 基金":"Super fund","银行 BSB / 账号":"Bank BSB / Acct","税号 TFN":"TFN","入职状态":"Onboarding",
    "调取":"Reveal","离职熔断":"Offboard","恢复账号":"Reactivate","员工未提交":"Not submitted yet","已完成":"Complete","待填写":"Pending",
    "离职一键熔断 · TFN 加密调取 · 签证工时总览":"Instant offboarding · encrypted TFN · visa hours",
    // —— 排班 ——
    "智能排班引擎":"Smart rostering","一键按员工可上班时间自动排 · 可拖拽调整 · 学生签工时硬卡控":"Auto-roster from availability · drag to adjust · student-visa cap",
    "一键智能排班":"Auto-roster","本周排班总薪资":"This week's wages","占预估营业额":"% of forecast revenue","学生签工时":"Student-visa hours",
    "法定薪资自动计算":"Award pay auto-calc","排班":"Roster","招人":"Hire","任务":"Tasks","换班":"Swaps","收银":"POS","后厨":"Kitchen","桌码":"QR",
    "智能排班":"Rostering","一键招人":"Quick hire","任务清单":"Tasks","点餐收银":"POS","后厨看板":"Kitchen (KDS)","桌码点餐":"Table QR ordering",
    "保存排班":"Save shift","删除排班":"Remove shift","生成":"Generate",
    // —— POS / KDS ——
    "点餐收银 POS":"POS","快速加单 · 收款找零 · 打烊盲对账防偷钱":"Fast ordering · change · blind drop",
    "打烊盲对账":"Blind drop","今日订单":"Today's orders","当前订单":"Current order","桌号":"Table","小计":"Subtotal","折扣":"Discount","应收":"Total due",
    "收款并下单":"Pay & send","手动打折":"Discount","清空":"Clear","收款":"Payment","现金":"Cash","刷卡":"Card","实收现金":"Cash received","找零":"Change",
    "确认收款 · 下单传后厨":"Confirm payment · send to kitchen","快准点钱 · 点击钞票面额数量自动算总额":"Tap note counts — total auto-sums",
    "盲数现金合计":"Blind-counted total","提交对账":"Submit reconciliation","对账结果":"Reconciliation result","退款":"Refund",
    "后厨传菜看板 KDS":"Kitchen Display (KDS)","大字方块实时显示订单 · 做完点一下消除 · 前后台秒级同步":"Live tickets · tap when done · instant sync",
    "完成出餐":"Mark served","暂无待出餐订单,后厨清爽 ✨":"No pending orders — kitchen's clear ✨","已出餐":"Served","顾客催菜!":"Customer urging!","已处理":"Handled",
    // —— 员工端 ——
    "我的班表":"My shifts","今日任务":"Today's tasks","换班市场":"Swap market","我的资料":"My profile","班表":"Shifts","资料":"Profile",
    "打卡上班":"Clock in","已打卡":"Clocked in","迟到":"Late","挂班":"Drop shift","当天上班一键打卡 · 临时有事可一键挂班":"Clock in for today · drop a shift if needed",
    "选好你每天能来的时段,经理\"一键排班\"会优先按你填的来排":"Pick the times you can work; auto-roster uses this",
    "不可":"Off","早班 09-15":"Morning 09-15","晚班 15-22":"Evening 15-22","全天 09-22":"All day 09-22",
    "完成后勾选并拍照上传 · 温度需填数值":"Tick when done & upload a photo","拍照":"Photo","已完成":"Done","待完成":"To do",
    "极简自助入职":"Self-onboarding","手机上填写 TFN / Super / 银行信息,3 分钟搞定":"Fill TFN / Super / bank in 3 minutes",
    // —— 设置 / 切换视图 ——
    "开关功能模块 · 控制各角色可用范围":"Toggle modules · control role access","启用":"Enabled","已启用":"On","已关闭":"Off",
    "老板可进入任意端预览,体验员工/经理看到的界面":"Owner can preview any role's screens","返回老板端":"Back to Owner","老板预览":"Owner preview",
    // —— 顾客反馈 ——
    "差评内部拦截 · 1-3 星留在内部由你处理,4-5 星已引导 Google 点评":"Bad reviews kept internal (1-3★); 4-5★ sent to Google","平均评分":"Avg rating","待处理差评":"Pending bad reviews","今日催菜":"Urges today","差评":"Bad","好评":"Good",
    // —— 顾客点餐 ——
    "自助点餐":"Self-order","全部":"All","主食":"Mains","小食":"Snacks","饮品":"Drinks","甜品":"Desserts",
    "下单":"Order","催菜":"Hurry up","再点一份":"Order more","提交给后厨":"Send to kitchen","合计":"Total","已下单,后厨马上做!":"Order placed — cooking now!",
    "用餐体验如何?":"How was your meal?","已通知后厨 ✓":"Kitchen notified ✓","正在加载菜单…":"Loading menu…","加备注(如去葱)":"Add note (e.g. no onion)",
    // —— 合规 / 通用提示 ——
    "Super 缴纳提醒":"Super reminder","签证工时监控总览":"Visa-hours overview","重置演示数据":"Reset demo data",
    "计算结果供参考,以雇主最终确认为准;本系统不提供税务建议、不直接申报。":"Figures are indicative; employer confirms. Not tax advice; no ATO filing.",
  };

  const KEYS = Object.keys(DICT).sort((a,b)=>b.length-a.length);  // 长词优先
  let lang = localStorage.getItem('mkr.lang') || 'zh';
  let observer = null;

  function translateText(node){
    let v = node.nodeValue; if(!v || !v.trim()) return;
    let out = v;
    for(const k of KEYS){ if(out.indexOf(k)>=0) out = out.split(k).join(DICT[k]); }
    if(out!==v) node.nodeValue = out;
  }
  function translateAttrs(el){
    ['placeholder','title','aria-label'].forEach(a=>{
      if(el.hasAttribute && el.hasAttribute(a)){ let v=el.getAttribute(a); for(const k of KEYS){ if(v.indexOf(k)>=0) v=v.split(k).join(DICT[k]); } el.setAttribute(a,v); }
    });
  }
  function walk(el){
    if(el.nodeType===3){ translateText(el); return; }
    if(el.nodeType!==1) return;
    if(el.tagName==='SCRIPT'||el.tagName==='STYLE') return;
    translateAttrs(el);
    const tw=document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const ns=[]; let n; while(n=tw.nextNode()) ns.push(n); ns.forEach(translateText);
    if(el.querySelectorAll) el.querySelectorAll('[placeholder],[title],[aria-label]').forEach(translateAttrs);
  }

  const I = {
    get lang(){ return lang; },
    t(s){ if(lang!=='en'||!s) return s; let out=s; for(const k of KEYS){ if(out.indexOf(k)>=0) out=out.split(k).join(DICT[k]); } return out; },
    start(){
      if(observer){ observer.disconnect(); observer=null; }
      if(lang!=='en') return;
      walk(document.body);
      observer=new MutationObserver(muts=>{ muts.forEach(m=>m.addedNodes.forEach(node=>{ try{ walk(node); }catch(e){} })); });
      observer.observe(document.body,{childList:true,subtree:true});
    },
    set(l){ lang=l; localStorage.setItem('mkr.lang',l); location.reload(); },
    toggle(){ I.set(lang==='en'?'zh':'en'); },
    DICT
  };
  MKR.i18n = I;
})();
