/* ===== Membership: loyalty points + stored value + e-coupons =====
   Customers are identified at checkout by phone number OR by their member QR
   code (the code is the member id, which the QR encodes). Every paid order can
   earn points and/or be paid from a stored-value balance, and public or
   member-specific coupons can be redeemed.

   Storage uses the generic local-first row store via MKR.db:
     members  {id(=code), phone, name, points, balance, visits, spent, history[], kitchenId, createdAt, updatedAt}
     coupons  {id, code, type:'pct'|'amt', value, minSpend, expiry, memberId, used, usedAt, usedOrder, kitchenId, createdAt}
   Loyalty rules live in app_meta.settings.loyalty.
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;

  const DEFAULTS = { pointsPerDollar:1, centsPerPoint:1, signupBonus:0 };
  // centsPerPoint = redemption value of one point in cents (1 => 100 pts = $1)

  function kid(){ const s=MKR.auth&&MKR.auth.current&&MKR.auth.current(); return (s&&s.kitchenId)||'k_main'; }
  function who(){ const s=MKR.auth&&MKR.auth.current&&MKR.auth.current(); return (s&&s.name)||'system'; }
  function normPhone(p){ return String(p||'').replace(/[^\d+]/g,''); }
  function genCode(){ // friendly, uppercase, scanner/QR-safe member id
    let s=''; const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for(let i=0;i<6;i++) s+=a[Math.floor(Math.random()*a.length)];
    return 'M'+s;
  }
  function genCouponCode(){
    let s=''; const a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for(let i=0;i<5;i++) s+=a[Math.floor(Math.random()*a.length)];
    return s;
  }

  async function config(){
    const s = (await MKR.db.meta('settings')) || {};
    return Object.assign({}, DEFAULTS, s.loyalty||{});
  }
  async function saveConfig(cfg){
    const s = (await MKR.db.meta('settings')) || {};
    s.loyalty = Object.assign({}, DEFAULTS, cfg);
    await MKR.db.meta('settings', s);
    return s.loyalty;
  }

  // ---- points <-> dollars ----
  async function earnFor(paid){ const c=await config(); return Math.floor((+paid||0)*c.pointsPerDollar); }
  async function pointsToDollars(points){ const c=await config(); return +(((+points||0)*c.centsPerPoint)/100).toFixed(2); }
  async function dollarsToPoints(dollars){ const c=await config(); return Math.ceil(((+dollars||0)*100)/Math.max(1,c.centsPerPoint)); }

  // ---- members ----
  async function all(){ return (await MKR.db.getAll('members')).filter(m=>!m.kitchenId || m.kitchenId===kid()); }
  async function findByCode(code){
    if(!code) return null;
    const m = await MKR.db.get('members', String(code).trim().toUpperCase());
    return (m && (!m.kitchenId || m.kitchenId===kid())) ? m : null;
  }
  async function findByPhone(phone){
    const p = normPhone(phone); if(!p) return null;
    return (await all()).find(m=>normPhone(m.phone)===p) || null;
  }
  // accepts a phone number OR a member code; phones contain digits & length>=5
  async function lookup(q){
    const v = String(q||'').trim(); if(!v) return null;
    const digits = v.replace(/\D/g,'');
    if(/^M[A-Z0-9]{6}$/i.test(v)) return findByCode(v);
    if(digits.length>=5) return (await findByPhone(v)) || (await findByCode(v));
    return findByCode(v);
  }
  async function create({phone,name}){
    const c = await config();
    let id = genCode();
    // avoid the rare collision
    for(let i=0;i<5 && await MKR.db.get('members', id); i++) id = genCode();
    const m = { id, phone:normPhone(phone), name:(name||'').trim()||'Member', points:c.signupBonus||0,
      balance:0, visits:0, spent:0, history:[], kitchenId:kid(), createdAt:Date.now() };
    if(c.signupBonus>0) m.history.push({ts:Date.now(), type:'signup', points:c.signupBonus, note:'Welcome bonus'});
    await MKR.db.put('members', m);
    await MKR.audit.log({action:'member.create', desc:`New member ${m.name} (${m.id})${m.phone?' · '+m.phone:''}`, target:m.id});
    return m;
  }
  async function getOrCreate(phone, name){
    return (await findByPhone(phone)) || (await create({phone, name}));
  }

  // Apply the result of a paid order to a member.
  //   {orderId, paid, earned, redeemPoints, balanceUsed, couponCode}
  async function applyOrder(memberId, o){
    const m = await MKR.db.get('members', memberId); if(!m) return null;
    const earned = +o.earned||0, redeemed = +o.redeemPoints||0, bal = +o.balanceUsed||0, paid = +o.paid||0;
    const next = {
      id: m.id,
      points: Math.max(0, (m.points||0) + earned - redeemed),
      balance: Math.max(0, +(((m.balance||0) - bal)).toFixed(2)),
      visits: (m.visits||0) + 1,
      spent: +(((m.spent||0) + paid)).toFixed(2),
      history: (m.history||[]).concat([{ ts:Date.now(), type:'order', orderId:o.orderId, paid,
        earned, redeemed, balanceUsed:bal, coupon:o.couponCode||null }])
    };
    await MKR.db.put('members', next);
    return next;
  }
  async function topUp(memberId, amount, method){
    const m = await MKR.db.get('members', memberId); if(!m) return null;
    const amt = +(+amount).toFixed(2); if(!(amt>0)) return m;
    const next = { id:m.id, balance:+(((m.balance||0)+amt)).toFixed(2),
      history:(m.history||[]).concat([{ts:Date.now(), type:'topup', amount:amt, method:method||'cash', by:who()}]) };
    await MKR.db.put('members', next);
    await MKR.audit.log({action:'member.topup', desc:`Top-up ${U.money(amt)} → ${m.name} (${m.id})`, amount:amt, target:m.id});
    return next;
  }
  async function adjustPoints(memberId, delta, note){
    const m = await MKR.db.get('members', memberId); if(!m) return null;
    const d = Math.round(+delta||0); if(!d) return m;
    const next = { id:m.id, points:Math.max(0,(m.points||0)+d),
      history:(m.history||[]).concat([{ts:Date.now(), type:'adjust', points:d, note:note||'', by:who()}]) };
    await MKR.db.put('members', next);
    await MKR.audit.log({action:'member.points', desc:`${d>=0?'+':''}${d} pts → ${m.name} (${m.id})${note?' · '+note:''}`, target:m.id});
    return next;
  }

  // ---- coupons ----
  async function allCoupons(){ return (await MKR.db.getAll('coupons')).filter(c=>!c.kitchenId || c.kitchenId===kid()); }
  async function issueCoupon({type,value,minSpend,expiry,memberId,count}){
    const n = Math.max(1, Math.min(500, +count||1));
    const out = [];
    for(let i=0;i<n;i++){
      const c = { id:U.uid('cpn'), code:genCouponCode(), type:(type==='amt'?'amt':'pct'),
        value:+value||0, minSpend:+minSpend||0, expiry:expiry||null, memberId:memberId||null,
        used:false, kitchenId:kid(), createdAt:Date.now() };
      await MKR.db.put('coupons', c); out.push(c);
    }
    await MKR.audit.log({action:'coupon.issue', desc:`Issued ${n} coupon(s) · ${out[0].type==='pct'?out[0].value+'%':U.money(out[0].value)} off${memberId?' · member '+memberId:''}`});
    return out;
  }
  async function findCoupon(code){
    if(!code) return null;
    const cc = String(code).trim().toUpperCase();
    return (await allCoupons()).find(c=>String(c.code).toUpperCase()===cc) || null;
  }
  // Validate a coupon against a member + base amount. Returns {ok, discount, coupon, reason}
  async function validateCoupon(code, member, base){
    const c = await findCoupon(code);
    if(!c) return { ok:false, reason:'No such coupon' };
    if(c.used) return { ok:false, reason:'Coupon already used' };
    if(c.expiry && c.expiry < U.todayISO()) return { ok:false, reason:'Coupon expired' };
    if(c.memberId && (!member || member.id!==c.memberId)) return { ok:false, reason:'Coupon belongs to another member' };
    if(c.minSpend && base < c.minSpend) return { ok:false, reason:`Minimum spend ${U.money(c.minSpend)}` };
    const discount = c.type==='pct' ? +((base*c.value/100).toFixed(2)) : Math.min(c.value, base);
    return { ok:true, discount, coupon:c };
  }
  async function redeemCoupon(coupon, orderId){
    if(!coupon) return;
    await MKR.db.put('coupons', { id:coupon.id, used:true, usedAt:Date.now(), usedOrder:orderId||null });
  }

  MKR.membership = {
    DEFAULTS, config, saveConfig, genCode, genCouponCode, normPhone,
    earnFor, pointsToDollars, dollarsToPoints,
    all, findByCode, findByPhone, lookup, create, getOrCreate, applyOrder, topUp, adjustPoints,
    allCoupons, issueCoupon, findCoupon, validateCoupon, redeemCoupon
  };
})();
