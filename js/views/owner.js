/* ===== Owner Portal ===== */
window.MKR = window.MKR || {}; MKR.portals = MKR.portals || {};
(function(){
  const U = MKR.util;
  const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const isToday = ts => new Date(ts).toISOString().slice(0,10)===U.todayISO();

  async function metrics(){
    const orders = await MKR.db.getAll('orders');
    const todays = orders.filter(o=>isToday(o.createdAt) && o.paid && o.status!=='cancelled' && o.status!=='refunded');
    const revenue = todays.reduce((s,o)=>s+o.total,0);
    const recs = (await MKR.db.getAll('reconciliations')).filter(r=>r.date===U.todayISO());
    const variance = recs.length? recs[recs.length-1].variance : null;
    const alerts = (await MKR.db.getAll('alerts')).filter(a=>!a.read);
    return {orders:todays, revenue, variance, alerts, count:todays.length};
  }

  // Scan today's shifts: planned start passed by 1h with no clock-in → No Show alert (deduped)
  async function noShowScan(){
    const todayIdx=(new Date().getDay()+6)%7;
    const shifts=(await MKR.db.getAll('shifts')).filter(s=>s.day===todayIdx);
    const clockins=await MKR.db.getAll('clockins');
    const users=await MKR.db.getAll('users');
    const now=Date.now();
    for(const s of shifts){
      const startTs=MKR.alerts.shiftStartTs(s);
      if(now > startTs+60*60000 && !clockins.find(k=>k.shiftId===s.id)){
        const u=users.find(x=>x.id===s.staffId);
        await MKR.alerts.raise({key:'noshow-'+s.id, level:'red', type:'noshow', title:'Staff No-Show risk',
          desc:`${u?u.name:'A staff member'}'s ${DAYS[s.day]} ${s.start} shift is 1h past start with no clock-in`});
      }
    }
  }

  MKR.portals.owner = {
    home:'dashboard', subtitle:'Hands-off management — results & approvals only',
    nav:[
      {id:'dashboard', label:'Dashboard',    em:'📊', short:'Dash'},
      {id:'report',    label:'Daily report', em:'📩', short:'Report'},
      {id:'alerts',    label:'Alerts',       em:'🚨', short:'Alerts'},
      {id:'audit',     label:'Audit log',    em:'🔍', short:'Audit'},
      {id:'labor',     label:'Labor cost',   em:'💰', short:'Labor'},
      {id:'team',      label:'Team',         em:'👥', short:'Team'},
      {id:'kitchens',  label:'Super Admin',  em:'🏢', short:'Admin'},
      {id:'compliance',label:'Compliance',   em:'🛡️', short:'Comply'},
      {id:'feedback',  label:'Feedback',     em:'⭐', short:'Reviews'},
      {id:'switch',    label:'Switch view',  em:'👁', short:'Switch'},
      {id:'settings',  label:'Settings',     em:'⚙️', short:'Settings'},
    ],
    async badges(){ const a=(await MKR.db.getAll('alerts')).filter(x=>!x.read && x.level==='red').length; return a?{alerts:a}:{}; },
    async view(section,c,arg){
      if(section==='dashboard') return dashboard(c);
      if(section==='report') return report(c);
      if(section==='alerts') return alerts(c);
      if(section==='audit') return audit(c);
      if(section==='labor') return labor(c);
      if(section==='team') return team(c,arg);
      if(section==='kitchens') return kitchens(c,arg);
      if(section==='compliance') return compliance(c);
      if(section==='feedback') return feedback(c);
      if(section==='switch') return switchView(c);
      if(section==='settings') return settings(c);
    }
  };

  // ---------- Customer feedback (bad-review interception) ----------
  async function feedback(c){
    const all=await MKR.db.getAll('customer_feedback');
    const fbs=all.filter(f=>f.type==='review').sort((a,b)=>b.ts-a.ts);
    const bad=fbs.filter(f=>f.rating<=3);
    const todayUrge=all.filter(f=>f.type==='urge' && new Date(f.ts).toISOString().slice(0,10)===U.todayISO()).length;
    const avg=fbs.length?(fbs.reduce((s,f)=>s+f.rating,0)/fbs.length).toFixed(1):'—';
    c.innerHTML=`
      <div class="section-head"><div><h2>Customer feedback</h2><p>Bad reviews kept internal (1-3★) for you to handle; 4-5★ sent to Google</p></div></div>
      <div class="grid g3" style="margin-bottom:18px">
        <div class="card stat"><div class="k">⭐ Average rating</div><div class="v">${avg}</div><div class="delta flat">${fbs.length} reviews</div></div>
        <div class="card stat"><div class="k">😟 Bad (1-3★)</div><div class="v" style="color:${bad.length?'var(--red)':'inherit'}">${bad.length}</div><div class="delta flat">kept internal</div></div>
        <div class="card stat"><div class="k">🔔 Urges today</div><div class="v">${todayUrge}</div></div>
      </div>
      <div class="card" style="padding:8px 18px"><div class="list">
        ${fbs.length? fbs.map(f=>`<div class="li">
          <div class="ava" style="background:${f.rating<=3?'var(--red-soft)':'var(--green-soft)'};color:${f.rating<=3?'var(--red)':'var(--green)'}">${f.rating}★</div>
          <div class="meta"><b>${'★'.repeat(f.rating)}<span class="faint">${'★'.repeat(5-f.rating)}</span> · table ${U.esc(f.table||'—')}</b>
            <span>${U.esc(f.comment||'(no written review)')} · ${U.ago(f.ts)}</span></div>
          ${f.rating<=3?'<span class="pill danger">Bad</span>':'<span class="pill ok">Good</span>'}</div>`).join('')
        :'<div class="empty"><div class="em">⭐</div><p>No customer reviews yet</p></div>'}
      </div></div>
      <div class="disclaimer mt16"><span>🛡️</span>1-3★ reviews are never public — shown only here so you can reach out privately; 4-5★ guests are guided to Google to boost public reputation.</div>`;
  }

  // ---------- Switch view (owner is super admin, can preview any portal) ----------
  function switchView(c){
    const card=(href,em,title,desc)=>`<a class="card clickable" href="${href}" style="padding:22px;display:block">
      <div style="font-size:30px">${em}</div><b style="font-size:17px;display:block;margin-top:8px">${title}</b>
      <span class="muted" style="font-size:13px">${desc}</span></a>`;
    c.innerHTML=`
      <div class="section-head"><div><h2>Switch view</h2><p>The owner can preview any portal and see exactly what staff / managers see</p></div></div>
      <div class="grid g3">
        ${card('#/owner/dashboard','👑','Owner','Dashboard · your current portal')}
        ${card('#/manager/schedule','📋','Manager · Roster','Smart rostering / add users / review')}
        ${card('#/manager/menu','🍔','Menu & Items','Add dishes / upload photos')}
        ${card('#/manager/pos','🧾','POS','Ordering · blind drop')}
        ${card('#/manager/kds','📺','Kitchen KDS','Live tickets')}
        ${card('#/staff/my','🧑‍🍳','Staff · Shifts','Clock-in / availability / claim')}
        ${card('#/staff/availability','🗓️','Staff · Availability','When staff can work')}
      </div>
      <div class="disclaimer mt16"><span>👁</span>Inside another portal the top shows an "Owner preview" banner — tap "Back to Owner" to return.</div>`;
  }

  // ---------- Settings (feature switches + role permissions) ----------
  async function settings(c){
    const mods = await MKR.features.load();
    const roleNames={owner:'Owner',manager:'Manager',staff:'Staff'};
    const work = JSON.parse(JSON.stringify(mods));
    c.innerHTML=`
      <div class="section-head"><div><h2>Settings</h2><p>Toggle modules · control which roles can access each one</p></div>
        <button class="btn btn-dark btn-sm" id="saveBtn">Save settings</button></div>
      <div class="card" style="padding:14px 18px;margin-bottom:16px"><div class="li" style="border:none;padding:0">
        <div class="meta"><b>System language</b><span>English / 简体中文</span></div>
        ${MKR.i18n?MKR.i18n.switcher():''}
      </div></div>
      <div class="card" style="padding:8px 18px"><div id="mlist"></div></div>
      <div class="disclaimer mt16"><span>ℹ️</span>Disabled features disappear from the matching portal's nav and direct access is blocked; saving applies to every device in the venue. Owner core (dashboard / audit / compliance / settings) is always available.</div>`;
    if(MKR.i18n) MKR.i18n.bindSwitchers(c);
    const el=U.qs('#mlist',c);
    function draw(){
      el.innerHTML=Object.keys(work).map(k=>{
        const m=work[k];
        const chips=['owner','manager','staff'].map(r=>`<button class="pill ${m.roles.includes(r)?'ok':'ghost'}" data-role="${k}:${r}" style="cursor:pointer">${roleNames[r]}</button>`).join(' ');
        return `<div class="li" style="flex-wrap:wrap;gap:10px">
          <div class="meta" style="min-width:150px"><b>${m.label}</b><span style="opacity:${m.on?1:.5}">${m.on?'On':'Off'}</span></div>
          <div class="row gap6 center wrap">${chips}
            <label style="display:inline-flex;align-items:center;gap:6px;margin-left:8px;cursor:pointer"><input type="checkbox" data-on="${k}" ${m.on?'checked':''} style="width:22px;height:22px"> Enabled</label>
          </div></div>`;
      }).join('');
      U.qsa('[data-role]',el).forEach(b=>b.onclick=()=>{ const [k,r]=b.dataset.role.split(':'); const arr=work[k].roles; const i=arr.indexOf(r); if(i>=0) arr.splice(i,1); else arr.push(r); draw(); });
      U.qsa('[data-on]',el).forEach(ch=>ch.onchange=()=>{ work[ch.dataset.on].on=ch.checked; draw(); });
    }
    draw();
    U.qs('#saveBtn',c).onclick=async()=>{
      await MKR.features.save(work);
      await MKR.audit.log({action:'settings.update', desc:'Updated settings / permissions'});
      U.toast('Settings saved across the venue','green');
    };
  }

  // ---------- Dashboard ----------
  async function dashboard(c){
    await noShowScan();
    const m = await metrics();
    const vClass = m.variance==null?'flat':(Math.abs(m.variance)<=20?'flat':'down');
    c.innerHTML = `
      <div class="section-head"><div><h2>Dashboard</h2><p>Runs quietly — only pings you when something's wrong</p></div></div>
      <div class="kpi-callout" id="kpi">
        <div class="kpi-main">
          <span class="kpi-label">Today's revenue</span>
          <span class="kpi-value">${U.money(m.revenue)}</span>
          <span class="kpi-sub">${m.count} order${m.count===1?'':'s'} today · live</span>
        </div>
        <div class="kpi-side">
          <div class="kpi-mini"><span>Cash variance</span><b style="color:${vClass==='down'?'var(--red)':'inherit'}">${m.variance==null?'—':(m.variance>=0?'+':'')+U.money0(m.variance)}</b></div>
          <div class="kpi-mini"><span>Unread alerts</span><b style="color:${m.alerts.length?'var(--red)':'inherit'}">${m.alerts.length}</b></div>
        </div>
      </div>
      <div class="grid g4" style="margin:18px 0">
        <a class="card stat clickable" href="#/owner/report"><div class="k">📈 Today's revenue</div><div class="v">${U.money0(m.revenue)}</div><div class="delta up">Live ›</div></a>
        <a class="card stat clickable" href="#/owner/report"><div class="k">💵 Blind-drop variance</div><div class="v">${m.variance==null?'—':(m.variance>=0?'+':'')+U.money0(m.variance)}</div><div class="delta ${vClass}">${m.variance==null?'Not reconciled':(Math.abs(m.variance)<=20?'Normal':'Over threshold')} ›</div></a>
        <a class="card stat clickable" href="#/owner/report"><div class="k">🧾 Today's orders</div><div class="v">${m.count}<small> orders</small></div><div class="delta flat">View report ›</div></a>
        <a class="card stat clickable" href="#/owner/alerts"><div class="k">🚨 Unread alerts</div><div class="v" style="color:${m.alerts.length?'var(--red)':'inherit'}">${m.alerts.length}</div><div class="delta flat">${m.alerts.length?'Needs attention ›':'All good ›'}</div></a>
      </div>
      <div class="grid g2" style="align-items:start">
        <div class="card" style="padding:20px">
          <div class="section-title">🚨 Alerts · only when it matters<a href="#/owner/alerts" class="faint" style="font-size:12px">All →</a></div>
          <div id="aprev"></div>
        </div>
        <div class="card" style="padding:20px">
          <div class="section-title">📩 Today at a glance<a href="#/owner/report" class="faint" style="font-size:12px">Full report →</a></div>
          <div class="list">
            <a class="li clickable" href="#/owner/report"><div class="ava">💰</div><div class="meta"><b>${U.money(m.revenue)}</b><span>Today's revenue</span></div><span class="faint">›</span></a>
            <a class="li clickable" href="#/owner/report"><div class="ava">💵</div><div class="meta"><b>${m.variance==null?'Not reconciled':(m.variance>=0?'+':'')+U.money(m.variance)}</b><span>Cash blind-drop variance</span></div><span class="faint">›</span></a>
            <a class="li clickable" href="#/owner/compliance"><div class="ava">📅</div><div class="meta"><b>8 tables</b><span>Tomorrow's bookings (demo)</span></div><span class="faint">›</span></a>
          </div>
        </div>
      </div>
      <div class="disclaimer mt16"><span>ℹ️</span>This system aggregates and exports data; it does not connect to the ATO or give tax advice — final tax figures are confirmed by your accountant.</div>`;
    const ap = U.qs('#aprev',c);
    const red = m.alerts.slice(0,4);
    ap.innerHTML = red.length? red.map(a=>`<div class="alert ${a.level==='red'?'red':'amber'}" style="margin-bottom:10px"><span>${a.level==='red'?'⚠️':'🔔'}</span><div><b>${U.esc(a.title)}</b><br>${U.esc(a.desc)} · <span class="faint">${U.ago(a.ts)}</span></div></div>`).join('')
      : `<div class="empty"><div class="em">😌</div><p>No issues — running quietly</p></div>`;
  }

  // ---------- Daily report ----------
  async function report(c){
    const m = await metrics();
    const line = `Today's revenue ${U.money(m.revenue)} across ${m.count} orders; cash variance ${m.variance==null?'not reconciled':(m.variance>=0?'+':'')+U.money(m.variance)}; tomorrow 8 bookings.`;
    c.innerHTML = `
      <div class="section-head"><div><h2>Daily smart report</h2><p>Auto-pushed at close — the whole picture without logging in</p></div></div>
      <div class="card" style="padding:26px;max-width:560px">
        <div class="row center gap8" style="margin-bottom:14px"><div class="ava" style="width:42px;height:42px;border-radius:12px;background:var(--ink);color:var(--paper);display:grid;place-items:center">📩</div><div><b>My Kitchen manager</b><div class="faint" style="font-size:12px">${U.fmtDateTime(Date.now())} · closing push</div></div></div>
        <div style="background:var(--paper-2);border-radius:16px;padding:18px;font-size:16px;line-height:1.7">${line}</div>
        <div class="grid g3 mt16">
          <div class="card stat"><div class="k">Revenue</div><div class="v" style="font-size:22px">${U.money0(m.revenue)}</div></div>
          <div class="card stat"><div class="k">Orders</div><div class="v" style="font-size:22px">${m.count}</div></div>
          <div class="card stat"><div class="k">Cash variance</div><div class="v" style="font-size:22px">${m.variance==null?'—':(m.variance>=0?'+':'')+U.money0(m.variance)}</div></div>
        </div>
        <button class="btn btn-dark btn-block mt16" id="push">📲 Re-push to my phone</button>
      </div>`;
    U.qs('#push',c).onclick=()=>U.toast('Report pushed (demo — not actually sent)','green');
  }

  // ---------- Alerts ----------
  async function alerts(c){
    let list=(await MKR.db.getAll('alerts')).sort((a,b)=>b.ts-a.ts);
    function draw(){
      c.innerHTML=`<div class="section-head"><div><h2>Critical alerts</h2><p>Only fires on variance / big refunds / lateness etc.</p></div>
        ${list.some(a=>!a.read)?'<button class="btn btn-ghost btn-sm" id="readAll">Mark all read</button>':''}</div>
        <div id="al"></div>`;
      const el=U.qs('#al',c);
      if(!list.length){ el.innerHTML=`<div class="empty"><div class="em">😌</div><p>No alerts — all good</p></div>`; return; }
      el.innerHTML=list.map(a=>`<div class="alert ${a.level==='red'?'red':'amber'}" style="margin-bottom:12px;${a.read?'opacity:.55':''}"><span>${a.level==='red'?'⚠️':'🔔'}</span>
        <div class="grow"><b>${U.esc(a.title)}</b><br>${U.esc(a.desc)} · <span class="faint">${U.ago(a.ts)}</span></div>
        ${a.read?'<span class="pill ghost">Read</span>':`<button class="btn btn-ghost btn-sm" data-r="${a.id}">Mark read</button>`}</div>`).join('');
      U.qsa('[data-r]',el).forEach(b=>b.onclick=async()=>{ await MKR.db.put('alerts',{id:b.dataset.r,read:true}); list=(await MKR.db.getAll('alerts')).sort((x,y)=>y.ts-x.ts); draw(); });
      const ra=U.qs('#readAll',c); if(ra) ra.onclick=async()=>{ for(const a of list) if(!a.read) await MKR.db.put('alerts',{id:a.id,read:true}); list=(await MKR.db.getAll('alerts')).sort((x,y)=>y.ts-x.ts); draw(); };
    }
    draw();
  }

  // ---------- Audit log ----------
  async function audit(c){
    const logs=await MKR.audit.all();
    c.innerHTML=`<div class="section-head"><div><h2>Sensitive-action audit</h2><p>Edits / cancels / discounts / refunds fully tracked · append-only, tamper-proof</p></div>
      <span class="pill ghost">🔒 Append-only · ${logs.length} entries</span></div>
      <div class="card" style="padding:8px 18px"><div class="list">
      ${logs.length? logs.map(l=>`<div class="li"><div class="ava">${iconOf(l.action)}</div>
        <div class="meta"><b>${MKR.audit.label(l.action)}${l.amount!=null?' · '+U.money(l.amount):''}</b><span>${U.esc(l.desc||'')}</span></div>
        <div style="text-align:right"><div style="font-size:13px;font-weight:600">${U.esc(l.actor||'System')}</div><div class="faint" style="font-size:11.5px">${U.fmtDateTime(l.ts)}</div></div></div>`).join('')
        : '<div class="empty"><div class="em">🗂️</div><p>No actions recorded yet</p></div>'}
      </div></div>
      <div class="disclaimer mt16"><span>🔒</span>The audit log is append-only — there is no delete or edit path anywhere in the system.</div>`;
    function iconOf(a){ return ({'order.refund':'↩️','order.discount':'🏷️','order.cancel':'✖️','order.create':'🧾','pay.blinddrop':'🥁','staff.offboard':'🔒','staff.hire':'➕','tfn.view':'🪪','login':'🔑','shift.create':'📅','shift.remove':'🗑️','sos.post':'🆘','labor.approve':'✅','labor.reject':'⛔','swap.approve':'🔁','menu.add':'🍔','menu.edit':'🍔','menu.remove':'🗑️','settings.update':'⚙️','kitchen.create':'🏢','kitchen.approve':'✅'})[a]||'•'; }
  }

  // ---------- Labor cost approval ----------
  async function labor(c){
    const settings=await MKR.db.meta('settings');
    const staff=(await MKR.db.getAll('users')).filter(u=>u.role==='staff'&&!u.offboarded);
    const shifts=await MKR.db.getAll('shifts');
    const staffOf=id=>staff.find(s=>s.id===id)||{baseRate:0,employment:'casual',name:'?'};
    const wage=shifts.reduce((t,s)=>t+MKR.pay.shiftPay(staffOf(s.staffId),s,MKR.seed.dayTs(s.day)).pay,0);
    const fc=settings.revenueForecast; const pct=wage/fc; const over=pct>settings.laborPctThreshold;
    const approved = await MKR.db.meta('laborApproved');

    c.innerHTML=`
      <div class="section-head"><div><h2>Labor cost approval</h2><p>Forecasts next week's revenue and labor ratio; auto-flags overruns in red</p></div></div>
      <div class="grid g3" style="margin-bottom:18px">
        <div class="card stat"><div class="k">Forecast revenue (next week)</div><div class="v">${U.money0(fc)}</div></div>
        <div class="card stat"><div class="k">Rostered wages (ref.)</div><div class="v">${U.money0(wage)}</div></div>
        <div class="card stat"><div class="k">Labor ratio</div><div class="v" style="color:${over?'var(--red)':'var(--green)'}">${U.round2(pct*100).toFixed(2)}<small>%</small></div><div class="delta flat">red line ${U.round2(settings.laborPctThreshold*100).toFixed(2)}%</div></div>
      </div>
      ${over?`<div class="alert red" style="margin-bottom:16px"><span>⚠️</span><div><b>Labor cost over threshold</b> · ratio ${U.round2(pct*100).toFixed(2)}% exceeds the ${U.round2(settings.laborPctThreshold*100).toFixed(2)}% red line — needs your approval.</div></div>`
            :`<div class="alert green" style="margin-bottom:16px"><span>✅</span><div>Labor ratio is healthy — nothing to action.</div></div>`}
      <div class="card" style="padding:22px;max-width:560px">
        <div class="section-title">Approve this week's roster cost</div>
        ${approved?`<div class="alert green"><span>✅</span><div>You approved this week's roster on ${U.fmtDateTime(approved)}.</div></div>`:`
        <p class="muted" style="font-size:14px">Wage figures are an award-based <b>indicative</b> calculation — please review before confirming.</p>
        <div class="row gap8 mt16"><button class="btn btn-green grow" id="ap">Approve</button><button class="btn btn-ghost grow" id="rj">Reject · request changes</button></div>`}
        <div class="disclaimer mt16"><span>⚖️</span>Figures are indicative; the employer confirms. This system gives no tax advice and does no filing.</div>
      </div>`;
    const ap=U.qs('#ap',c), rj=U.qs('#rj',c);
    if(ap) ap.onclick=async()=>{ await MKR.db.meta('laborApproved',Date.now()); await MKR.audit.log({action:'labor.approve',desc:`Approved this week's roster · ratio ${U.round2(pct*100).toFixed(2)}%`,amount:wage}); U.toast('Approved','green'); labor(c); };
    if(rj) rj.onclick=async()=>{ await MKR.audit.log({action:'labor.reject',desc:'Rejected roster · requested changes'}); U.toast('Rejected — the manager has been notified','amber'); };
  }

  // ---------- Super Admin · multi-tenant Kitchens ----------
  async function kitchens(c, arg){
    if(arg) return kitchenDetail(c, arg);
    const list=(await MKR.db.getAll('kitchens'));
    let kitch = list.length ? list : [{id:'k_main', name:(await MKR.db.meta('settings')||{}).shopName||'My Kitchen', location:'Melbourne, VIC', status:'active', primary:true, createdAt:Date.now()}];
    const users=await MKR.db.getAll('users');
    const usersIn = k => users.filter(u=>(u.kitchenId||'k_main')===k.id);
    const active=kitch.filter(k=>k.status==='active').length;
    const pending=kitch.filter(k=>k.status==='pending').length;

    c.innerHTML=`
      <div class="section-head"><div><h2>Super Admin · Kitchens</h2><p>Master dashboard — full visibility and provisioning across every venue (tenant)</p></div>
        <button class="btn btn-accent btn-sm" id="newK">＋ Create kitchen</button></div>
      <div class="grid g4" style="margin-bottom:18px">
        <div class="card stat"><div class="k">🏢 Kitchens</div><div class="v">${kitch.length}</div></div>
        <div class="card stat"><div class="k">✅ Active</div><div class="v" style="color:var(--green)">${active}</div></div>
        <div class="card stat"><div class="k">⏳ Pending approval</div><div class="v" style="color:${pending?'var(--amber)':'inherit'}">${pending}</div></div>
        <div class="card stat"><div class="k">👥 Total users</div><div class="v">${users.length}</div></div>
      </div>
      <div class="card" style="padding:8px 18px"><div class="list" id="klist"></div></div>
      <div class="disclaimer mt16"><span>🏢</span>Each kitchen is an isolated tenant. From here you have global visibility into every kitchen's data, configuration and users, and you approve or onboard new ones.</div>`;

    const el=U.qs('#klist',c);
    el.innerHTML=kitch.sort((a,b)=>(a.status==='pending'?-1:0)-(b.status==='pending'?-1:0)).map(k=>{
      const mem=usersIn(k);
      const mgr=mem.filter(u=>u.role==='manager').length, stf=mem.filter(u=>u.role==='staff').length;
      const badge = k.status==='active'?'<span class="pill ok">Active</span>': k.status==='pending'?'<span class="pill warn">Pending</span>':'<span class="pill ghost">'+U.esc(k.status)+'</span>';
      return `<div class="li">
        <div class="ava">🏢</div>
        <div class="meta"><b>${U.esc(k.name)} ${k.primary?'<span class="pill ghost">Primary</span>':''}</b><span>${U.esc(k.location||'—')} · ${mgr} manager(s) · ${stf} staff · ID ${U.esc(k.id)}</span></div>
        <div class="row gap6 center">
          ${badge}
          ${k.status==='pending'?`<button class="btn btn-green btn-sm" data-ap="${k.id}">Approve</button>`:''}
          <a class="btn btn-ghost btn-sm" href="#/owner/kitchens/${k.id}">View ›</a>
        </div></div>`;
    }).join('');
    U.qsa('[data-ap]',el).forEach(b=>b.onclick=async()=>{
      await MKR.db.put('kitchens',{id:b.dataset.ap, status:'active', approvedAt:Date.now()});
      await MKR.audit.log({action:'kitchen.approve', desc:`Approved kitchen ${b.dataset.ap}`});
      U.toast('Kitchen approved & provisioned','green'); kitchens(c);
    });
    U.qs('#newK',c).onclick=()=>{
      const wrap=U.el(`<div>
        <div class="field"><label>Kitchen / venue name</label><input class="input" id="k_name" placeholder="e.g. My Kitchen · Sydney"></div>
        <div class="field"><label>Location</label><input class="input" id="k_loc" placeholder="e.g. Sydney, NSW"></div>
        <div class="disclaimer"><span>ℹ️</span>New kitchens start as <b>Pending</b> until you approve them from this dashboard.</div>
      </div>`);
      U.modal('Create a new kitchen', wrap, {actions:[{label:'Create (pending)', class:'btn-dark', onClick:async(cl)=>{
        const name=U.qs('#k_name',wrap).value.trim(); if(!name){ U.toast('Please enter a name','red'); return; }
        const id='k_'+Math.random().toString(36).slice(2,8);
        await MKR.db.put('kitchens',{id, name, location:U.qs('#k_loc',wrap).value.trim(), status:'pending', ownerId:(MKR.auth.current()||{}).id, createdAt:Date.now()});
        await MKR.audit.log({action:'kitchen.create', desc:`Created kitchen ${name}`});
        cl(); U.toast('Kitchen created — pending approval','green'); kitchens(c);
      }}]});
    };
  }

  async function kitchenDetail(c, id){
    const k=(await MKR.db.getAll('kitchens')).find(x=>x.id===id) || {id, name:'My Kitchen', status:'active', primary:true};
    const users=(await MKR.db.getAll('users')).filter(u=>(u.kitchenId||'k_main')===id);
    const menu=(await MKR.db.getAll('menu')).filter(m=>(m.kitchenId||'k_main')===id);
    const settings=await MKR.db.meta('settings')||{};
    const mgrs=users.filter(u=>u.role==='manager');
    const staff=users.filter(u=>u.role==='staff');
    const owners=users.filter(u=>u.role==='owner');
    const group=(title,arr,em)=>`
      <div class="card" style="padding:6px 18px;margin-bottom:16px"><div class="section-title" style="padding-top:12px">${em} ${title} <span class="faint" style="font-size:12px">${arr.length}</span></div>
      <div class="list">${arr.length?arr.map(u=>`<a class="li clickable" href="#/owner/team/${u.id}"><div class="ava">${u.emoji||U.initials(u.name)}</div>
        <div class="meta"><b>${U.esc(u.name)} ${u.offboarded?'<span class="pill danger">Offboarded</span>':''}</b><span>Unique ID <b>${U.esc(u.id)}</b> · ${U.esc(u.position||MKR.auth.roleName(u.role))}</span></div>
        <span class="faint" style="font-size:22px">›</span></a>`).join(''):'<div class="empty" style="padding:20px"><div class="em">—</div><p>None</p></div>'}</div></div>`;

    c.innerHTML=`
      <div class="row center between wrap" style="margin-bottom:16px">
        <a class="btn btn-ghost btn-sm" href="#/owner/kitchens">← Back to kitchens</a>
        ${k.status==='pending'?`<button class="btn btn-green btn-sm" id="apK">Approve & provision</button>`:`<span class="pill ok">Active</span>`}
      </div>
      <div class="section-head"><div><h2>${U.esc(k.name)}</h2><p>${U.esc(k.location||'—')} · tenant ID ${U.esc(k.id)}</p></div></div>
      <div class="grid g4" style="margin-bottom:18px">
        <div class="card stat"><div class="k">👑 Owners</div><div class="v">${owners.length}</div></div>
        <div class="card stat"><div class="k">📋 Managers</div><div class="v">${mgrs.length}</div></div>
        <div class="card stat"><div class="k">🧑‍🍳 Staff</div><div class="v">${staff.length}</div></div>
        <div class="card stat"><div class="k">🍽️ Menu items</div><div class="v">${menu.length}</div></div>
      </div>
      <div class="section-title">Hierarchy &amp; unique IDs</div>
      ${owners.length?group('Owners',owners,'👑'):''}
      ${group('Managers',mgrs,'📋')}
      ${group('Staff',staff,'🧑‍🍳')}
      <div class="card" style="padding:6px 18px"><div class="section-title" style="padding-top:12px">⚙️ Configuration snapshot</div><div class="list">
        <div class="li"><div class="meta"><span>Operating hours</span><b>${(settings.operatingHours||{}).open||'—'} – ${(settings.operatingHours||{}).close||'—'}</b></div></div>
        <div class="li"><div class="meta"><span>Labor ratio red line</span><b>${settings.laborPctThreshold!=null?U.round2(settings.laborPctThreshold*100).toFixed(2)+'%':'—'}</b></div></div>
        <div class="li"><div class="meta"><span>Cash variance threshold</span><b>${settings.cashVarianceThreshold!=null?U.money(settings.cashVarianceThreshold):'—'}</b></div></div>
        <div class="li"><div class="meta"><span>Student-visa fortnight cap</span><b>${settings.visaCapFortnight||'—'} h</b></div></div>
      </div></div>
      <div class="disclaimer mt16"><span>🔑</span>Every user has a unique ID for signing into their customised portal. Tap a person to open their full profile.</div>`;
    const ap=U.qs('#apK',c); if(ap) ap.onclick=async()=>{ await MKR.db.put('kitchens',{id, status:'active', approvedAt:Date.now()}); await MKR.audit.log({action:'kitchen.approve', desc:`Approved kitchen ${id}`}); U.toast('Kitchen approved','green'); kitchenDetail(c,id); };
  }

  // ---------- Team management (offboard cut-off + TFN reveal + Super + visa) ----------
  const EMP_LABEL=e=>({casual:'Casual',parttime:'Part-time',fulltime:'Full-time'})[e]||e||'—';
  const VISA_LABEL=v=>({none:'None / citizen / PR',student:'Student visa',work:'Work visa',pr:'PR',citizen:'Australian citizen'})[v]||'None';

  async function team(c, arg){
    if(arg) return staffPage(c, arg);   // full-page staff profile
    const settings=await MKR.db.meta('settings');
    const users=(await MKR.db.getAll('users')).filter(u=>u.role==='staff');
    const shifts=await MKR.db.getAll('shifts');
    const visaHours=id=>U.round2(shifts.filter(s=>s.staffId===id).reduce((t,s)=>t+MKR.pay.hours(s.start,s.end),0));
    const active=users.filter(u=>!u.offboarded).length;
    c.innerHTML=`
      <div class="section-head"><div><h2>Team</h2><p>Tap a staff member for the full, editable profile (phone / email / passport / visa / contract / bank / TFN)</p></div>
        <span class="pill ghost">${active} active · ${users.length} total</span></div>
      <div class="card" style="padding:8px 18px"><div class="list" id="tlist"></div></div>
      <div class="disclaimer mt16"><span>🔒</span>Only the owner role can reveal a TFN / passport (each reveal is audited); offboarded staff data is encrypted and retained for 7 years for audit.</div>`;
    const el=U.qs('#tlist',c);
    el.innerHTML=users.map(u=>{
      const h=visaHours(u.id); const near=u.visa==='student'&&h>=settings.visaCapFortnight-6;
      return `<a class="li clickable" href="#/owner/team/${u.id}">
        <div class="ava">${u.emoji||U.initials(u.name)}</div>
        <div class="meta"><b>${U.esc(u.name)} ${u.offboarded?'<span class="pill danger">Offboarded</span>':''}</b>
          <span>ID ${U.esc(u.id)} · ${U.esc(u.position||EMP_LABEL(u.employment))} ${u.visa==='student'?`· student visa <b style="color:${near?'var(--red)':'inherit'}">${h.toFixed(2)}/${settings.visaCapFortnight}h</b>`:''} · ${u.onboarded?'onboarded':'pending'}</span></div>
        <span class="faint" style="font-size:22px;line-height:1">›</span></a>`;
    }).join('');
  }

  // ---------- Full staff profile (full page + editable) ----------
  async function staffPage(c, id){
    const settings=await MKR.db.meta('settings');
    const u=(await MKR.db.getAll('users')).find(x=>x.id===id);
    const ob=(await MKR.db.getAll('onboarding')).find(o=>o.userId===id);
    if(!u){ c.innerHTML=`<div class="empty"><div class="em">🤷</div><p>Staff member not found</p><a class="btn btn-ghost mt12" href="#/owner/team">← Back to team</a></div>`; return; }
    const shifts=await MKR.db.getAll('shifts');
    const h=U.round2(shifts.filter(s=>s.staffId===id).reduce((t,s)=>t+MKR.pay.hours(s.start,s.end),0));
    const availTxt=()=>{ const a=u.availability||{}; const m={off:'Off',am:'AM',pm:'PM',all:'All day'}; const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
      const parts=days.map((d,i)=>a[i]&&a[i]!=='off'?d+' '+m[a[i]]:null).filter(Boolean); return parts.length?parts.join(' · '):'Not set'; };

    function header(){ return `
      <div class="row center between wrap" style="margin-bottom:16px">
        <a class="btn btn-ghost btn-sm" href="#/owner/team">← Back to team</a>
        <div class="row gap8" id="headActions"></div>
      </div>
      <div class="row center gap8" style="margin-bottom:18px">
        <div class="ava" style="width:54px;height:54px;border-radius:15px;background:var(--accent-soft);color:var(--accent-ink);display:grid;place-items:center;font-size:24px">${u.emoji||U.initials(u.name)}</div>
        <div><b style="font-size:20px">${U.esc(u.name)}</b> ${u.offboarded?'<span class="pill danger">Offboarded</span>':'<span class="pill ok">Active</span>'}
          <div class="faint" style="font-size:13px">Unique ID ${U.esc(u.id)} · login ${U.esc(u.username||'—')} · ${EMP_LABEL(u.employment)}</div></div>
      </div>`; }

    // ---- View mode ----
    function renderView(){
      const row=(k,v)=>`<div class="li"><div class="meta"><span>${k}</span><b style="font-size:15px">${v||'—'}</b></div></div>`;
      const docRow=(label,data,key)=> data?`<div class="li"><div class="meta"><span>${label}</span><b style="font-size:15px">Uploaded</b></div><button class="btn btn-ghost btn-sm" data-doc="${key}">View</button></div>`:row(label,'<span class="faint">Not provided</span>');
      c.innerHTML=`
        <div style="max-width:680px">
        ${header()}
        <div class="card" style="padding:6px 18px;margin-bottom:16px"><div class="section-title" style="padding-top:12px">Basic info</div><div class="list">
          ${row('Phone', U.esc(u.phone))}
          ${row('Email', U.esc(u.email))}
          ${row('Position', U.esc(u.position))}
          ${row('Age', u.age!=null?u.age:'')}
          ${row('Start date', U.esc(u.startDate))}
          ${row('Address', U.esc(u.address))}
          ${row('Emergency contact', U.esc(u.emergency))}
          ${row('Availability', availTxt())}
        </div></div>
        <div class="card" style="padding:6px 18px;margin-bottom:16px"><div class="section-title" style="padding-top:12px">Visa & compliance</div><div class="list">
          ${row('Visa type', VISA_LABEL(u.visa))}
          ${row('Visa expiry', U.esc(u.visaExpiry))}
          ${row('Fortnight hours', u.visa==='student'?(h.toFixed(2)+' / '+settings.visaCapFortnight+'h'):h.toFixed(2)+'h')}
          ${row('Contract type', EMP_LABEL(u.employment))}
          ${row('Passport no.', ob&&ob.passportEnc?'<span id="ppSlot">'+MKR.crypto.mask()+'</span> <button class="btn btn-ghost btn-sm" id="ppBtn" style="margin-left:6px;min-height:32px;padding:0 12px">Reveal</button>':'')}
        </div></div>
        <div class="card" style="padding:6px 18px;margin-bottom:16px"><div class="section-title" style="padding-top:12px">Pay · bank · tax</div><div class="list">
          ${row('Base rate (ref.)', U.money(u.baseRate||0)+' /h')}
          ${row('Super fund', U.esc(ob&&ob.superFund))}
          ${row('Bank BSB / acct', ob?U.esc((ob.bsb||'—')+' / '+(ob.acct||'—')):'')}
          ${row('TFN', ob&&ob.tfnEnc?'<span id="tfnSlot">'+MKR.crypto.mask()+'</span> <button class="btn btn-ghost btn-sm" id="tfnBtn" style="margin-left:6px;min-height:32px;padding:0 12px">Reveal</button>':'(not submitted)')}
        </div></div>
        <div class="card" style="padding:6px 18px;margin-bottom:16px"><div class="section-title" style="padding-top:12px">Onboarding documents</div><div class="list">
          ${docRow('Passport / ID', ob&&ob.passportDoc, 'passportDoc')}
          ${docRow('TFN declaration form', ob&&ob.tfnForm, 'tfnForm')}
          ${docRow('Super choice form', ob&&ob.superForm, 'superForm')}
          ${row('Onboarding', u.onboarded?'<span class="pill ok">Complete</span>'+(ob&&ob.signedAt?' · signed '+U.fmtDate(ob.signedAt):''):'<span class="pill warn">Pending</span>')}
        </div></div>
        ${u.offboarded?`<div class="card" style="padding:6px 18px;margin-bottom:16px"><div class="section-title" style="padding-top:12px">Offboard archive</div><div class="list">
          ${row('Offboarded on', u.archivedAt?new Date(u.archivedAt).toISOString().slice(0,10):'')}
          ${row('Retained until', u.retentionUntil?new Date(u.retentionUntil).toISOString().slice(0,10):'')}
        </div></div>`:''}
        <div class="disclaimer"><span>🔒</span>TFN / passport are encrypted separately and only the owner can reveal them; each reveal is written to the audit log.</div>
        </div>`;
      // Head actions
      const ha=U.qs('#headActions',c);
      ha.innerHTML = `<button class="btn btn-dark btn-sm" id="editBtn">✏️ Edit profile</button>
        ${u.offboarded?'<button class="btn btn-green btn-sm" id="restoreBtn">Reactivate</button>':'<button class="btn btn-danger btn-sm" id="offBtn">Offboard</button>'}`;
      U.qs('#editBtn',c).onclick=renderEdit;
      const offB=U.qs('#offBtn',c); if(offB) offB.onclick=()=>offboard();
      const reB=U.qs('#restoreBtn',c); if(reB) reB.onclick=async()=>{ await MKR.db.put('users',{id,offboarded:false,archivedAt:null,retentionUntil:null}); if(MKR.supa.client) await MKR.supa.client.from('profiles').update({active:true}).eq('staff_id',id); U.toast(u.name+' reactivated','green'); staffPage(c,id); };
      // Document viewers
      U.qsa('[data-doc]',c).forEach(b=>b.onclick=()=>{ const img=ob[b.dataset.doc]; if(img) U.modal('Document', `<img src="${img}" style="width:100%;border-radius:12px">`); });
      // TFN / passport reveal
      const tb=U.qs('#tfnBtn',c); if(tb) tb.onclick=async()=>{ const v=await MKR.crypto.dec(ob.tfnEnc); await MKR.audit.log({action:'tfn.view',desc:`Revealed ${u.name}'s TFN`}); U.qs('#tfnSlot',c).textContent=v; tb.remove(); };
      const pb=U.qs('#ppBtn',c); if(pb) pb.onclick=async()=>{ const v=await MKR.crypto.dec(ob.passportEnc); await MKR.audit.log({action:'tfn.view',desc:`Revealed ${u.name}'s passport no.`}); U.qs('#ppSlot',c).textContent=v; pb.remove(); };
    }

    // ---- Edit mode ----
    function renderEdit(){
      const fld=(id,label,val,type='text',ph='')=>`<div class="field"><label>${label}</label><input class="input" id="${id}" type="${type}" value="${U.esc(val==null?'':val)}" placeholder="${ph}"></div>`;
      const sel=(id,label,val,opts)=>`<div class="field"><label>${label}</label><select class="input" id="${id}">${opts.map(([v,t])=>`<option value="${v}" ${val===v?'selected':''}>${t}</option>`).join('')}</select></div>`;
      c.innerHTML=`
        <div style="max-width:680px">
        ${header()}
        <div class="card" style="padding:18px;margin-bottom:16px"><div class="section-title">Basic info</div>
          ${fld('f_phone','Phone',u.phone,'tel','04XX XXX XXX')}
          ${fld('f_email','Email',u.email,'email','name@example.com')}
          ${fld('f_position','Position',u.position,'text','e.g. Front of House / Kitchen')}
          <div class="row"><div class="grow">${fld('f_age','Age',u.age,'number')}</div><div class="grow">${fld('f_start','Start date',u.startDate,'date')}</div></div>
          ${fld('f_address','Address',u.address)}
          ${fld('f_emergency','Emergency contact',u.emergency,'text','name + phone')}
        </div>
        <div class="card" style="padding:18px;margin-bottom:16px"><div class="section-title">Visa & compliance</div>
          <div class="row"><div class="grow">${sel('f_visa','Visa type',u.visa||'none',[['none','None / citizen / PR'],['student','Student visa'],['work','Work visa'],['pr','PR'],['citizen','Australian citizen']])}</div>
          <div class="grow">${fld('f_visaExp','Visa expiry',u.visaExpiry,'date')}</div></div>
          ${sel('f_emp','Contract type',u.employment||'casual',[['casual','Casual'],['parttime','Part-time'],['fulltime','Full-time']])}
          ${fld('f_passport','Passport no. (encrypted)','', 'text', ob&&ob.passportEnc?'stored (leave blank to keep)':'enter passport no.')}
        </div>
        <div class="card" style="padding:18px;margin-bottom:16px"><div class="section-title">Pay · bank · tax</div>
          ${fld('f_rate','Base rate AUD',u.baseRate,'number')}
          ${fld('f_super','Super fund',ob&&ob.superFund)}
          <div class="row"><div class="grow">${fld('f_bsb','Bank BSB',ob&&ob.bsb,'text','000-000')}</div><div class="grow">${fld('f_acct','Account number',ob&&ob.acct)}</div></div>
          ${fld('f_tfn','TFN (encrypted)','','text', ob&&ob.tfnEnc?'stored (leave blank to keep)':'9 digits')}
        </div>
        <div class="row gap8" style="max-width:680px">
          <button class="btn btn-dark grow" id="saveBtn">Save profile</button>
          <button class="btn btn-ghost grow" id="cancelBtn">Cancel</button>
        </div>
        <div class="disclaimer mt12"><span>🔒</span>Passport / TFN are AES-encrypted and stored separately — only the owner can reveal them.</div>
        </div>`;
      U.qs('#cancelBtn',c).onclick=renderView;
      U.qs('#saveBtn',c).onclick=async()=>{
        const v=id2=>{ const e=U.qs('#'+id2,c); return e?e.value.trim():''; };
        // Non-sensitive → users
        await MKR.db.put('users',{ id,
          phone:v('f_phone'), email:v('f_email'), position:v('f_position'),
          age:v('f_age')?Number(v('f_age')):null, startDate:v('f_start'), address:v('f_address'), emergency:v('f_emergency'),
          visa:v('f_visa'), visaExpiry:v('f_visaExp'), employment:v('f_emp'), baseRate:v('f_rate')?Number(v('f_rate')):(u.baseRate||0) });
        // Sensitive / bank → onboarding (encrypted)
        const obId = (ob&&ob.id) || ('onb_'+id);
        const rec = { id:obId, userId:id, superFund:v('f_super'), bsb:v('f_bsb'), acct:v('f_acct') };
        if(ob){ rec.passportDoc=ob.passportDoc; rec.tfnForm=ob.tfnForm; rec.superForm=ob.superForm; }
        const pp=v('f_passport'); if(pp) rec.passportEnc=await MKR.crypto.enc(pp); else if(ob&&ob.passportEnc) rec.passportEnc=ob.passportEnc;
        const tf=v('f_tfn').replace(/\D/g,''); if(tf) rec.tfnEnc=await MKR.crypto.enc(tf); else if(ob&&ob.tfnEnc) rec.tfnEnc=ob.tfnEnc;
        await MKR.db.put('onboarding', rec);
        await MKR.audit.log({action:'staff.hire', desc:`Updated ${u.name}'s profile`});
        U.toast('Profile saved','green');
        staffPage(c,id);   // re-fetch and return to view
      };
    }

    async function offboard(){
      if(await U.confirm('Instant offboard cut-off',`Mark ${u.name} as offboarded? The account is disabled at the database layer and immediately loses access to all data; compliance data is encrypted and retained for 7 years.`,{ok:'Confirm offboard',danger:true})){
        const now=Date.now();
        await MKR.db.put('users',{id,offboarded:true, archivedAt:now, retentionUntil: now+7*365*24*3600*1000});
        if(MKR.supa.client) await MKR.supa.client.from('profiles').update({active:false}).eq('staff_id',id);
        await MKR.audit.log({action:'staff.offboard',desc:`Offboard cut-off · ${u.name}`});
        U.toast(`${u.name}'s access cut off`,'red'); staffPage(c,id);
      }
    }
    renderView();
  }

  // ---------- Compliance ----------
  async function compliance(c){
    const settings=await MKR.db.meta('settings');
    const staff=(await MKR.db.getAll('users')).filter(u=>u.role==='staff'&&!u.offboarded);
    const shifts=await MKR.db.getAll('shifts');
    const wage=shifts.reduce((t,s)=>{ const st=staff.find(x=>x.id===s.staffId)||{baseRate:0,employment:'casual'}; return t+MKR.pay.shiftPay(st,s,MKR.seed.dayTs(s.day)).pay; },0);
    const superDue=wage*settings.superRate;
    const stu=staff.filter(s=>s.visa==='student');
    const tasks=(await MKR.db.getAll('tasks')).filter(t=>t.date===U.todayISO());
    const archived=(await MKR.db.getAll('users')).filter(u=>u.role==='staff'&&u.offboarded);

    c.innerHTML=`
      <div class="section-head"><div><h2>Compliance</h2><p>Super reminder · visa hours · food-safety audit report</p></div></div>
      <div class="grid g2" style="align-items:start">
        <div class="card" style="padding:22px">
          <div class="section-title">💼 Super reminder</div>
          <div class="stat" style="padding:0"><div class="v">${U.money0(superDue)}</div><div class="delta flat">est. at ${U.round2(settings.superRate*100).toFixed(2)}% · due ${settings.superDue}</div></div>
          <div class="alert amber mt12"><span>⏰</span><div>Confirm Super is paid before this quarter's deadline to avoid late penalties.</div></div>
          <button class="btn btn-ghost btn-sm btn-block mt12" id="superRemind">Mark as reminded</button>
        </div>
        <div class="card" style="padding:22px">
          <div class="section-title">🛂 Visa-hours overview</div>
          <div class="list">
            ${stu.length? stu.map(s=>{ const h=U.round2(shifts.filter(x=>x.staffId===s.id).reduce((t,x)=>t+MKR.pay.hours(x.start,x.end),0)); const near=h>=settings.visaCapFortnight-6;
              return `<div class="li"><div class="ava">${U.initials(s.name)}</div><div class="meta"><b>${U.esc(s.name)}</b><span>Student visa · fortnight cap ${settings.visaCapFortnight}h</span></div>
              <span class="pill ${near?'danger':'ok'}">${h.toFixed(2)}/${settings.visaCapFortnight}h</span></div>`; }).join('')
              : '<div class="empty"><div class="em">🛂</div><p>No student-visa staff</p></div>'}
          </div>
        </div>
      </div>
      <div class="card mt16" style="padding:22px">
        <div class="section-title">📋 Food-safety audit report (one-tap export)</div>
        <p class="muted" style="font-size:14px">Aggregates staff fridge-temperature logs and hygiene tasks into a Council food-safety audit format. Today: ${tasks.filter(t=>t.done).length}/${tasks.length} logged.</p>
        <div class="row gap8 mt12 wrap">
          <button class="btn btn-dark btn-sm" id="exportFood">📄 Export today's food-safety log</button>
          <button class="btn btn-ghost btn-sm" id="exportCsv">📊 Export sales / wages CSV</button>
        </div>
      </div>
      <div class="card mt16" style="padding:22px">
        <div class="section-title">🗄️ Offboarded staff data retention (7 years)</div>
        <p class="muted" style="font-size:14px">Offboarded staff records are not deleted — per Australian audit requirements they are encrypted and retained for 7 years; sensitive fields like TFN remain owner-only.</p>
        <div class="list mt8">
          ${archived.length? archived.map(u=>{
            const ru=u.retentionUntil? new Date(u.retentionUntil).toISOString().slice(0,10):'—';
            const au=u.archivedAt? new Date(u.archivedAt).toISOString().slice(0,10):'—';
            return `<div class="li"><div class="ava">🗄️</div><div class="meta"><b>${U.esc(u.name)}</b><span>Offboarded ${au} · data encrypted & retained</span></div><span class="pill ghost">until ${ru}</span></div>`;
          }).join('') : '<div class="empty"><div class="em">🗄️</div><p>No offboard archive</p></div>'}
        </div>
      </div>
      <div class="disclaimer mt16"><span>⚖️</span>This system aggregates and exports data; it does not connect to the ATO or give tax advice — final wage / tax figures are confirmed by the accountant / employer.</div>
      <div class="row mt24"><button class="btn btn-ghost btn-sm" id="resetBtn">↺ Reset demo data</button></div>`;

    U.qs('#superRemind',c).onclick=async()=>{ await MKR.audit.log({action:'super.remind',desc:'Super reminder confirmed',amount:superDue}); U.toast('Recorded','green'); };
    U.qs('#exportFood',c).onclick=()=>exportFood(tasks);
    U.qs('#exportCsv',c).onclick=()=>exportCsv();
    U.qs('#resetBtn',c).onclick=async()=>{ if(await U.confirm('Reset demo data','This clears all local data and reloads the demo accounts. Continue?',{ok:'Reset',danger:true})) MKR.seed.reset(); };
  }

  function download(name,content,type){ const b=new Blob([content],{type}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
  function exportFood(tasks){
    const rows=['Food-safety log,'+U.todayISO(),'Task,Status,Value,By,Time'];
    tasks.forEach(t=>rows.push(`${t.name},${t.done?'Done':'Not done'},${t.value||''},${t.by||''},${t.done?'submitted':''}`));
    download('food-safety-'+U.todayISO()+'.csv','﻿'+rows.join('\n'),'text/csv');
    MKR.audit.log({action:'export',desc:'Exported food-safety log'}); U.toast('CSV exported','green');
  }
  async function exportCsv(){
    const orders=(await MKR.db.getAll('orders')).filter(o=>isToday(o.createdAt));
    const rows=['Order,Amount AUD,Method,Status,Time'];
    orders.forEach(o=>rows.push(`${o.id.slice(-4)},${o.total.toFixed(2)},${o.method==='cash'?'cash':'card'},${o.status},${U.fmtDateTime(o.createdAt)}`));
    download('sales-'+U.todayISO()+'.csv','﻿'+rows.join('\n'),'text/csv');
    MKR.audit.log({action:'export',desc:'Exported sales CSV'}); U.toast('CSV exported','green');
  }
})();
