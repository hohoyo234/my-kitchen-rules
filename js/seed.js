/* ===== 初始演示数据 ===== */
window.MKR = window.MKR || {};
(function(){
  const S = {};

  S.MENU = [
    {id:'m_pho',  cat:'主食', nm:'招牌牛肉河粉', price:18.5, recipe:{牛肉:0.15,河粉:0.2}},
    {id:'m_pad',  cat:'主食', nm:'泰式炒河粉',   price:17.0, recipe:{河粉:0.2,鸡蛋:1}},
    {id:'m_rice', cat:'主食', nm:'海南鸡饭',     price:16.5, recipe:{鸡肉:0.2,米:0.15}},
    {id:'m_lak',  cat:'主食', nm:'咖喱叻沙',     price:18.0, recipe:{面:0.2,椰浆:0.1}},
    {id:'m_dump', cat:'小食', nm:'煎饺(6只)',    price:9.5,  recipe:{饺子:6}},
    {id:'m_roll', cat:'小食', nm:'越南春卷',     price:8.5,  recipe:{春卷:2}},
    {id:'m_wing', cat:'小食', nm:'香炸鸡翅',     price:11.0, recipe:{鸡翅:4}},
    {id:'m_tea',  cat:'饮品', nm:'港式奶茶',     price:5.5,  recipe:{茶:1}},
    {id:'m_coke', cat:'饮品', nm:'可乐',         price:4.0,  recipe:{可乐:1}},
    {id:'m_beer', cat:'饮品', nm:'本地啤酒',     price:9.0,  recipe:{啤酒:1}},
    {id:'m_juice',cat:'饮品', nm:'鲜榨橙汁',     price:7.0,  recipe:{橙:3}},
    {id:'m_ice',  cat:'甜品', nm:'椰汁西米露',   price:6.5,  recipe:{西米:0.1}},
  ];

  // 三端账号（演示用）
  S.USERS = [
    {id:'u_boss', role:'owner',   name:'王老板', username:'boss', pin:'1111', emoji:'👑'},
    {id:'u_mgr',  role:'manager', name:'李经理', username:'mgr',  pin:'2222', emoji:'📋'},
    // 员工
    {id:'u_amy',  role:'staff', name:'Amy',  username:'amy',  pin:'3333', emoji:'🧑‍🍳',
      age:22, employment:'casual',   baseRate:28.26, visa:'student', onboarded:true},
    {id:'u_kevin',role:'staff', name:'Kevin',username:'kevin',pin:'3333', emoji:'🧑‍🍳',
      age:31, employment:'parttime', baseRate:25.41, visa:'none',    onboarded:true},
    {id:'u_leo',  role:'staff', name:'Leo',  username:'leo',  pin:'3333', emoji:'🧑‍🍳',
      age:19, employment:'casual',   baseRate:24.10, visa:'student', onboarded:false},
  ];

  S.SETTINGS = {
    shopName:'My Kitchen · 墨尔本店',
    cashVarianceThreshold:20,   // 盲对账差异警报阈值 $
    laborPctThreshold:0.28,     // 人工费占比红线
    revenueForecast:12500,      // 下周预估营业额
    superRate:0.115,            // Super 比例 11.5%
    superDue:'2026-07-28',      // 本季度截止
    visaCapFortnight:48,        // 学生签双周工时上限
    dailyTasks:['冰箱温度检查','后厨深度清洁','备料检查','地面拖洗','打烊冷柜盘点拍照'],
  };

  // 本周排班（周一为起点，相对今天）
  function weekStart(){ const d=new Date(); const day=(d.getDay()+6)%7; d.setHours(0,0,0,0); d.setDate(d.getDate()-day); return d; }
  function dayTs(offset){ const d=weekStart(); d.setDate(d.getDate()+offset); return d.getTime(); }
  S.weekStart = weekStart; S.dayTs = dayTs;

  S.SHIFTS = [
    {id:'s1', staffId:'u_amy',   day:0, start:'09:00', end:'15:00'},
    {id:'s2', staffId:'u_kevin', day:0, start:'15:00', end:'22:00'},
    {id:'s3', staffId:'u_amy',   day:1, start:'09:00', end:'15:00'},
    {id:'s4', staffId:'u_leo',   day:1, start:'15:00', end:'22:00'},
    {id:'s5', staffId:'u_amy',   day:2, start:'09:00', end:'15:00'},
    {id:'s6', staffId:'u_kevin', day:2, start:'15:00', end:'22:00'},
    {id:'s7', staffId:'u_leo',   day:3, start:'10:00', end:'18:00'},
    {id:'s8', staffId:'u_amy',   day:4, start:'09:00', end:'15:00'},
    {id:'s9', staffId:'u_kevin', day:5, start:'12:00', end:'22:00'},
    {id:'s10',staffId:'u_leo',   day:5, start:'12:00', end:'22:00'},
  ];

  S.ensure = async function(){
    const seeded = await MKR.db.meta('seeded');
    if(seeded) return;                              // 云端已被某台设备初始化过 → 跳过
    for(const u of S.USERS) await MKR.db.put('users', {...u});
    for(const m of S.MENU)  await MKR.db.put('menu',  {...m});
    for(const s of S.SHIFTS) await MKR.db.put('shifts', {...s});
    await MKR.db.meta('settings', S.SETTINGS);
    // 今日任务实例
    for(let i=0;i<S.SETTINGS.dailyTasks.length;i++)
      await MKR.db.put('tasks', {id:'t'+i, name:S.SETTINGS.dailyTasks[i], date:MKR.util.todayISO(), done:false, photo:null, by:null});
    // 一条示例审计
    await MKR.db.put('audit', {id:'a0', ts:Date.now()-3600e3, action:'order.refund', desc:'退款 · 顾客投诉上错菜', amount:24, actor:'Kevin', actorRole:'staff', frozen:true});
    await MKR.db.meta('seeded', true);
  };

  // 一键重置（调试用）
  S.reset = async function(){
    await MKR.db.wipe();
    location.reload();
  };

  MKR.seed = S;
})();
