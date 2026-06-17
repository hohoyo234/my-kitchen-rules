/* ===== Initial demo data ===== */
window.MKR = window.MKR || {};
(function(){
  const S = {};

  S.MENU = [
    {id:'m_pho',  cat:'Mains',    nm:'Signature Beef Pho',   price:18.5, recipe:{beef:0.15,noodle:0.2}},
    {id:'m_pad',  cat:'Mains',    nm:'Pad Thai',             price:17.0, recipe:{noodle:0.2,egg:1}},
    {id:'m_rice', cat:'Mains',    nm:'Hainanese Chicken Rice',price:16.5,recipe:{chicken:0.2,rice:0.15}},
    {id:'m_lak',  cat:'Mains',    nm:'Curry Laksa',          price:18.0, recipe:{noodle:0.2,coconut:0.1}},
    {id:'m_dump', cat:'Snacks',   nm:'Pan-fried Dumplings (6)',price:9.5,recipe:{dumpling:6}},
    {id:'m_roll', cat:'Snacks',   nm:'Vietnamese Spring Rolls',price:8.5,recipe:{roll:2}},
    {id:'m_wing', cat:'Snacks',   nm:'Crispy Chicken Wings',  price:11.0, recipe:{wing:4}},
    {id:'m_tea',  cat:'Drinks',   nm:'Hong Kong Milk Tea',    price:5.5,  recipe:{tea:1}},
    {id:'m_coke', cat:'Drinks',   nm:'Coke',                  price:4.0,  recipe:{coke:1}},
    {id:'m_beer', cat:'Drinks',   nm:'Local Beer',            price:9.0,  recipe:{beer:1}},
    {id:'m_juice',cat:'Drinks',   nm:'Fresh Orange Juice',    price:7.0,  recipe:{orange:3}},
    {id:'m_ice',  cat:'Desserts', nm:'Coconut Sago',          price:6.5,  recipe:{sago:0.1}},
  ];

  // Three-portal demo accounts (PROFILE DATA ONLY — no passwords here).
  // Credentials live in Supabase Auth; create the matching Auth users + profiles
  // rows via the dashboard or MKR.setup.createDemoAccounts(). See SECURITY.md.
  S.USERS = [
    {id:'u_boss', role:'owner',   name:'James Carter', username:'boss', status:'active', emoji:'👑'},
    {id:'u_mgr',  role:'manager', name:'Maria Lopez',  username:'mgr',  status:'active', emoji:'📋'},
    // Staff
    {id:'u_amy',  role:'staff', name:'Amy',  username:'amy',  status:'active', emoji:'🧑‍🍳',
      age:22, employment:'casual',   baseRate:28.26, visa:'student', position:'Front of House', onboarded:true},
    {id:'u_kevin',role:'staff', name:'Kevin',username:'kevin',status:'active', emoji:'🧑‍🍳',
      age:31, employment:'parttime', baseRate:25.41, visa:'none',    position:'Kitchen',        onboarded:true},
    {id:'u_leo',  role:'staff', name:'Leo',  username:'leo',  status:'active', emoji:'🧑‍🍳',
      age:19, employment:'casual',   baseRate:24.10, visa:'student', position:'Kitchen',        onboarded:false},
  ];

  S.SETTINGS = {
    shopName:'My Kitchen · Melbourne',
    cashVarianceThreshold:20,   // blind-drop variance alert threshold $
    laborPctThreshold:0.28,     // labor-cost ratio red line
    revenueForecast:12500,      // next week's forecast revenue
    superRate:0.115,            // Super rate 11.5%
    superDue:'2026-07-28',      // this quarter's deadline
    visaCapFortnight:48,        // student-visa fortnight hours cap
    operatingHours:{open:'09:00', close:'22:00'},   // venue opening / closing time
    // Configurable shift slots used by the auto-roster (flexible shift settings)
    shiftSlots:[
      {label:'Morning', start:'09:00', end:'15:00', k:'am'},
      {label:'Evening', start:'15:00', end:'22:00', k:'pm'},
    ],
    // Custom roles / departments staff can be assigned to
    customRoles:['Kitchen','Front of House','Cashier','Dishwasher','Head Chef'],
    // Role-based FIXED operating hours (departments that run the whole day)
    roleShifts:{ 'Kitchen':{start:'09:00', end:'22:00', fixed:true} },
    dailyTasks:['Fridge temperature check','Deep clean kitchen','Prep check','Mop floors','Closing fridge stocktake photo'],
  };

  // Default kitchen / venue (multi-tenant root) — already set up and approved.
  S.KITCHENS = [
    {id:'k_main', name:'My Kitchen · Melbourne', location:'Melbourne, VIC', status:'active',
     ownerId:'u_boss', primary:true, setupComplete:true, logo:null,
     phone:'03 9000 0000', email:'hello@mykitchen.au', website:'https://mykitchen.au',
     operatingHours:{open:'09:00', close:'22:00'}, createdAt:Date.now()-90*24*3600e3},
  ];

  // This week's roster (Monday as the start, relative to today)
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
    if(seeded) return;                              // a device already seeded the cloud → skip
    for(const k of S.KITCHENS) await MKR.db.put('kitchens', {...k});
    for(const u of S.USERS) await MKR.db.put('users', {...u, kitchenId:'k_main'});
    for(const m of S.MENU)  await MKR.db.put('menu',  {...m, kitchenId:'k_main'});
    for(const s of S.SHIFTS) await MKR.db.put('shifts', {...s});
    await MKR.db.meta('settings', S.SETTINGS);
    await MKR.db.meta('brand', {name:S.SETTINGS.shopName, avatar:null});
    // Today's task instances
    for(let i=0;i<S.SETTINGS.dailyTasks.length;i++)
      await MKR.db.put('tasks', {id:'t'+i, name:S.SETTINGS.dailyTasks[i], date:MKR.util.todayISO(), done:false, photo:null, by:null});
    // One sample audit entry
    await MKR.db.put('audit', {id:'a0', ts:Date.now()-3600e3, action:'order.refund', desc:'Refund · customer complaint, wrong dish served', amount:24, actor:'Kevin', actorRole:'staff', frozen:true});
    await MKR.db.meta('seeded', true);
  };

  // One-tap reset (debug)
  S.reset = async function(){
    await MKR.db.wipe();
    location.reload();
  };

  MKR.seed = S;
})();
