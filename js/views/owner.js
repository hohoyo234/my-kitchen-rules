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
      {id:'analytics', label:'Analytics',    em:'📈', short:'Analytics'},
      {id:'report',    label:'Daily report', em:'📩', short:'Report'},
      {id:'alerts',    label:'Alerts',       em:'🚨', short:'Alerts'},
      {id:'audit',     label:'Audit log',    em:'🔍', short:'Audit'},
      {id:'labor',     label:'Labor cost',   em:'💰', short:'Labor'},
      {id:'team',      label:'Team',         em:'👥', short:'Team'},
      {id:'performance',label:'Performance', em:'🏅', short:'Perform'},
      {id:'membership',label:'Membership',   em:'🪪', short:'Members'},
      {id:'branches',  label:'Branches',     em:'🏢', short:'Branches'},
      {id:'compliance',label:'Compliance',   em:'🛡️', short:'Comply'},
      {id:'feedback',  label:'Feedback',     em:'⭐', short:'Reviews'},
      {id:'switch',    label:'Switch view',  em:'👁', short:'Switch'},
      {id:'settings',  label:'Settings',     em:'⚙️', short:'Settings'},
    ],
    async badges(){ const a=(await MKR.db.getAll('alerts')).filter(x=>!x.read && x.level==='red').length; return a?{alerts:a}:{}; },
    async view(section,c,arg){
      // First-run setup gate: a freshly-approved owner must add a logo + pick features.
      const sess=MKR.auth.current();
      if(sess && sess.role==='owner' && sess.kitchenId){
        const k=await MKR.db.get('kitchens', sess.kitchenId);
        if(k && k.setupComplete===false && section!=='setup') return setupWizard(c, k);
      }
      if(section==='setup') return setupWizard(c, sess && sess.kitchenId ? await MKR.db.get('kitchens', sess.kitchenId) : null);
      if(section==='dashboard') return dashboard(c);
      if(section==='analytics') return analytics(c);
      if(section==='report') return report(c);
      if(section==='alerts') return alerts(c);
      if(section==='audit') return audit(c);
      if(section==='labor') return labor(c);
      if(section==='team') return team(c,arg);
      if(section==='performance') return performanceView(c);
      if(section==='membership') return membership(c);
      if(section==='branches') return branches(c);
      if(section==='compliance') return compliance(c);
      if(section==='feedback') return feedback(c);
      if(section==='switch') return switchView(c);
      if(section==='settings') return settings(c);
    }
  };

  // ---------- First-run owner setup wizard (logo + feature selection) ----------
  async function setupWizard(c, kitchen){
    const sess=MKR.auth.current();
    kitchen = kitchen || {id:sess&&sess.kitchenId, name:'Your restaurant'};
    const mods = await MKR.features.load();
    const work = JSON.parse(JSON.stringify(mods));
    let logo = kitchen.logo || null;
    c.innerHTML=`
      <div class="section-head"><div><h2>Welcome — let's set up ${U.esc(kitchen.name||'your restaurant')}</h2>
        <p>Two quick steps: add your logo, then choose the features you want. You can change these later in Settings.</p></div></div>
      <div class="grid g2" style="align-items:start">
        <div class="card" style="padding:22px">
          <div class="section-title">1 · Restaurant logo</div>
          <p class="muted" style="font-size:13px;margin-bottom:10px">Your logo appears on the sign-in page and in every portal.</p>
          <label class="img-drop"><div class="img-preview" id="logoPrev">${logo?`<img src="${logo}">`:'<span>📷 Tap to upload your logo</span>'}</div><input type="file" id="logoFile" accept="image/*" hidden></label>
          <div class="field mt12"><label>Display name</label><input class="input" id="setName" value="${U.esc(kitchen.name||'')}"></div>
        </div>
        <div class="card" style="padding:22px">
          <div class="section-title">2 · Choose your features</div>
          <p class="muted" style="font-size:13px;margin-bottom:10px">Tick the modules you want. Unticked ones are hidden from your team.</p>
          <div id="featList"></div>
        </div>
      </div>
      <div class="row gap8 mt16" style="max-width:560px"><button class="btn btn-dark grow" id="finishSetup">✅ Finish setup</button></div>
      <div class="disclaimer mt12"><span>ℹ️</span>You can revisit Settings anytime to toggle features or switch language.</div>`;
    U.qs('#logoFile',c).onchange=(e)=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ logo=r.result; U.qs('#logoPrev',c).innerHTML=`<img src="${logo}">`; }; r.readAsDataURL(f); };
    const fl=U.qs('#featList',c);
    fl.innerHTML=Object.keys(work).map(k=>{
      const m=work[k];
      return `<label class="onb-item" style="cursor:pointer">
        <input type="checkbox" data-feat="${k}" ${m.on?'checked':''} style="width:20px;height:20px">
        <div class="grow"><b>${U.esc(m.label)}</b><div class="faint" style="font-size:12px">for ${(m.roles||[]).join(', ')||'everyone'}</div></div></label>`;
    }).join('');
    U.qsa('[data-feat]',fl).forEach(ch=>ch.onchange=()=>{ work[ch.dataset.feat].on=ch.checked; });
    U.qs('#finishSetup',c).onclick=async()=>{
      const name=U.qs('#setName',c).value.trim()||kitchen.name;
      await MKR.db.put('kitchens',{id:kitchen.id, name, logo, modules:work, setupComplete:true});
      await MKR.features.save(work, kitchen.id);
      await MKR.db.meta('brand', {name, avatar:logo});       // syncs logo to the login page
      await MKR.audit.log({action:'settings.update', desc:'Completed restaurant setup'});
      U.toast('Setup complete — welcome aboard! 🎉','green');
      location.hash='#/owner/dashboard'; MKR.router.render();
    };
  }

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
    const sess = MKR.auth.current();
    const kitchen = sess && sess.kitchenId ? await MKR.db.get('kitchens', sess.kitchenId) : null;
    let rLogo = kitchen ? (kitchen.logo||null) : null;
    c.innerHTML=`
      <div class="section-head"><div><h2>Settings</h2><p>Toggle modules · control which roles can access each one</p></div>
        <button class="btn btn-dark btn-sm" id="saveBtn">Save settings</button></div>
      ${kitchen?`
      <div class="card pad20" style="margin-bottom:16px">
        <div class="section-title" style="margin-top:0">🏪 Restaurant profile</div>
        <p class="muted" style="font-size:13px;margin-bottom:12px">Your logo and name appear in the sidebar, on the sign-in page and across every portal.</p>
        <div class="row gap8 wrap" style="align-items:flex-start">
          <label class="img-drop" style="width:140px;flex:none">
            <div class="img-preview" id="rLogoPrev" style="min-height:120px">${rLogo?`<img src="${rLogo}">`:'<span>📷 Tap to upload</span>'}</div>
            <input type="file" id="rLogoFile" accept="image/*" hidden>
          </label>
          <div class="grow" style="min-width:200px">
            <div class="field"><label>Restaurant name</label><input class="input" id="rName" value="${U.esc(kitchen.name||'')}" placeholder="Your restaurant name"></div>
            <div class="row gap8 wrap">
              <button class="btn btn-dark btn-sm" id="rSave">Save profile</button>
              <button class="btn btn-ghost btn-sm" id="rClear">Remove logo</button>
            </div>
          </div>
        </div>
      </div>`:''}
      <div class="card" style="padding:14px 18px;margin-bottom:16px"><div class="li" style="border:none;padding:0">
        <div class="meta"><b>System language</b><span>English / 简体中文</span></div>
        ${MKR.i18n?MKR.i18n.switcher():''}
      </div></div>
      <div class="card pad20" style="margin-bottom:16px">
        <div class="section-title" style="margin-top:0">📤 Data export / reports</div>
        <p class="muted" style="font-size:13px;margin-bottom:12px">One-tap export of revenue, wages, roster or the audit log — download CSV or print to PDF.</p>
        <div class="row gap8 wrap">
          <div class="field" style="margin:0;min-width:170px"><label>What to export</label>
            <select class="input" id="exType">
              <option value="revenue">Revenue (sales)</option>
              <option value="wages">Wages &amp; labor</option>
              <option value="roster">Roster</option>
              <option value="audit">Audit log</option>
            </select></div>
          <div class="field" style="margin:0;min-width:150px"><label>Date range</label>
            <select class="input" id="exRange">
              <option value="today">Today</option>
              <option value="week" selected>This week</option>
              <option value="month">This month</option>
              <option value="custom">Custom…</option>
            </select></div>
        </div>
        <div class="row gap8 wrap hidden" id="exCustom" style="margin-top:2px">
          <div class="field" style="margin:0"><label>From</label><input class="input" id="exFrom" type="date"></div>
          <div class="field" style="margin:0"><label>To</label><input class="input" id="exTo" type="date"></div>
        </div>
        <div class="row gap8 wrap mt12">
          <button class="btn btn-dark btn-sm" id="exCsv">⬇️ Export CSV</button>
          <button class="btn btn-ghost btn-sm" id="exPdf">🖨️ Print / PDF</button>
        </div>
        <div class="faint" id="exNote" style="font-size:11.5px;margin-top:8px"></div>
        <div class="disclaimer mt12"><span>⚖️</span>Indicative figures for your records — this does not connect to the ATO. Send exports to your accountant to confirm.</div>
      </div>
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

    // ---- Restaurant profile (logo + name) ----
    if(kitchen){
      const prev=U.qs('#rLogoPrev',c);
      U.qs('#rLogoFile',c).onchange=(e)=>{ const f=e.target.files[0]; if(!f) return;
        if(f.size>2*1024*1024){ U.toast('Image too large — please use one under 2 MB','red'); return; }
        const r=new FileReader(); r.onload=()=>{ rLogo=r.result; prev.innerHTML=`<img src="${rLogo}">`; }; r.readAsDataURL(f); };
      U.qs('#rClear',c).onclick=()=>{ rLogo=null; prev.innerHTML='<span>📷 Tap to upload</span>'; };
      U.qs('#rSave',c).onclick=async()=>{
        const name=U.qs('#rName',c).value.trim()||kitchen.name;
        await MKR.db.put('kitchens',{id:kitchen.id, name, logo:rLogo});
        await MKR.db.meta('brand', {name, avatar:rLogo});      // keeps the sign-in page in sync
        await MKR.audit.log({action:'settings.update', desc:'Updated restaurant profile (logo / name)'});
        U.toast('Restaurant profile saved','green');
        MKR.router.refresh();                                  // repaint the shell with the new logo/name
      };
    }

    // ---- Data export / reports ----
    const kid=(sess&&sess.kitchenId)||'k_main';
    const DAYS2=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const exRange=U.qs('#exRange',c), exType=U.qs('#exType',c), exCustom=U.qs('#exCustom',c), exNote=U.qs('#exNote',c);
    function getRange(){
      const r=exRange.value, now=new Date(), today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
      let from, to=today.getTime()+864e5-1, label;
      if(r==='today'){ from=today.getTime(); label='Today'; }
      else if(r==='month'){ from=new Date(today.getFullYear(),today.getMonth(),1).getTime(); label='This month'; }
      else if(r==='custom'){ const f=U.qs('#exFrom',c).value, t=U.qs('#exTo',c).value; from=f?new Date(f).getTime():0; to=t?new Date(t).getTime()+864e5-1:Date.now(); label=(f||'…')+' → '+(t||'…'); }
      else { const d=new Date(today); d.setDate(d.getDate()-((d.getDay()+6)%7)); from=d.getTime(); label='This week'; }
      return {from,to,label};
    }
    function noteText(){
      const wk = exType.value==='wages'||exType.value==='roster';
      exNote.textContent = wk ? 'Wages & roster reflect the current week\'s roster (shifts are weekly).' : 'Revenue & audit use the selected date range.';
    }
    exRange.onchange=()=>{ exCustom.classList.toggle('hidden', exRange.value!=='custom'); };
    exType.onchange=noteText; noteText();
    async function buildExport(){
      const type=exType.value, {from,to,label}=getRange();
      if(type==='revenue'){
        const o=(await MKR.db.getAll('orders')).filter(x=>x.createdAt>=from&&x.createdAt<=to&&x.paid&&x.status!=='cancelled'&&x.status!=='refunded').sort((a,b)=>a.createdAt-b.createdAt);
        const rows=o.map(x=>[U.fmtDateTime(x.createdAt),'#'+String(x.id).slice(-4),(x.items||[]).reduce((s,i)=>s+(i.qty||1),0),x.method||'',x.server||x.by||'',(x.total||0).toFixed(2)]);
        return {name:'revenue',label,headers:['Time','Order','Items','Method','Served by','Total AUD'],rows,footer:['','','','','Total',o.reduce((s,x)=>s+(x.total||0),0).toFixed(2)]};
      }
      if(type==='audit'){
        const l=(await MKR.db.getAll('audit')).filter(x=>x.ts>=from&&x.ts<=to).sort((a,b)=>a.ts-b.ts);
        return {name:'audit',label,headers:['Time','Action','Actor','Amount','Detail'],rows:l.map(x=>[U.fmtDateTime(x.ts),MKR.audit.label(x.action),x.actor||'System',x.amount!=null?Number(x.amount).toFixed(2):'',x.desc||''])};
      }
      const staff=(await MKR.db.getAll('users')).filter(u=>(u.kitchenId||'k_main')===kid&&u.role!=='owner'&&!u.offboarded);
      const shifts=(await MKR.db.getAll('shifts')).filter(s=>staff.some(u=>u.id===s.staffId));
      if(type==='roster'){
        const rows=shifts.slice().sort((a,b)=>a.day-b.day||a.start.localeCompare(b.start)).map(s=>{ const u=staff.find(x=>x.id===s.staffId)||{}; return [DAYS2[s.day],U.fmtDate(MKR.seed.dayTs(s.day)),u.name||s.staffId,s.start,s.end,U.round2(MKR.pay.hours(s.start,s.end)).toFixed(2)]; });
        return {name:'roster',label:'Current week',headers:['Day','Date','Staff','Start','End','Hours'],rows};
      }
      let tot=0; const rows=staff.map(u=>{ const ss=shifts.filter(x=>x.staffId===u.id); const h=U.round2(ss.reduce((t,x)=>t+MKR.pay.hours(x.start,x.end),0)); const pay=ss.reduce((t,x)=>t+MKR.pay.shiftPay(u,x,MKR.seed.dayTs(x.day)).pay,0); tot+=pay; return [u.name,MKR.auth.roleName(u.role),ss.length,h.toFixed(2),pay.toFixed(2)]; }).filter(r=>r[2]>0);
      return {name:'wages',label:'Current week',headers:['Staff','Role','Shifts','Hours','Est. pay AUD'],rows,footer:['','','','Total',tot.toFixed(2)]};
    }
    function toCSV(d){ const esc=v=>`"${String(v==null?'':v).replace(/"/g,'""')}"`; const all=[d.headers,...d.rows]; if(d.footer) all.push(d.footer); return all.map(r=>r.map(esc).join(',')).join('\n'); }
    function toHTML(d){ const e=U.esc, name=(kitchen&&kitchen.name)||'My Kitchen';
      return `<div style="font-family:Inter,system-ui,sans-serif;padding:24px;color:#211E1B">
        <h2 style="margin:0 0 2px">${e(name)} — ${e(d.name)} report</h2>
        <p style="color:#6F655B;font-size:13px;margin:0 0 14px">${e(d.label)} · generated ${e(U.fmtDateTime(Date.now()))}</p>
        ${d.rows.length?`<table cellspacing="0" cellpadding="7" style="border-collapse:collapse;width:100%;font-size:13px">
          <thead><tr>${d.headers.map(h=>`<th align="left" style="border-bottom:2px solid #211E1B;padding:7px">${e(h)}</th>`).join('')}</tr></thead>
          <tbody>${d.rows.map(r=>`<tr>${r.map(c2=>`<td style="border-bottom:1px solid #ddd;padding:7px">${e(c2)}</td>`).join('')}</tr>`).join('')}
          ${d.footer?`<tr>${d.footer.map(c2=>`<td style="border-top:2px solid #211E1B;padding:7px;font-weight:700">${e(c2)}</td>`).join('')}</tr>`:''}</tbody></table>`
          :'<p>No data for this range.</p>'}
        <p style="font-size:11px;color:#9A8F84;margin-top:18px">Indicative figures for your records. This system does not connect to the ATO or give tax advice.</p></div>`;
    }
    U.qs('#exCsv',c).onclick=async()=>{ const d=await buildExport(); if(!d.rows.length){ U.toast('Nothing to export for that range','amber'); return; } U.download(`${d.name}-${U.todayISO()}.csv`, toCSV(d)); await MKR.audit.log({action:'export',desc:`Exported ${d.name} (${d.label})`}); U.toast('CSV exported','green'); };
    U.qs('#exPdf',c).onclick=async()=>{ const d=await buildExport(); U.printHTML(toHTML(d)); await MKR.audit.log({action:'export',desc:`Printed ${d.name} (${d.label})`}); };
  }

  // ---------- Dashboard ----------
  // Inline SVG icon set (replaces emoji for a consistent, crisp look)
  const IC = {
    revenue:'<path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v6h-6"/>',
    orders:'<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    avg:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.6 9.4a2.4 2 0 0 1 4.8 0c0 1.3-1.2 1.7-2.4 2.2s-2.4 1-2.4 2.4a2.4 2 0 0 0 4.8 0"/>',
    labor:'<path d="M12 20v-6M6 20v-3M18 20v-9"/><path d="M3 20h18"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    chart:'<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="6" rx="1"/><rect x="12" y="7" width="3" height="10" rx="1"/><rect x="17" y="13" width="3" height="4" rx="1"/>',
    calendar:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    cash:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  };
  const icon = (n,cls='')=>`<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]||''}</svg>`;
  const reduce = ()=> window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countUp(el, to, fmt){
    if(!el) return; if(reduce()){ el.textContent=fmt(to); return; }
    const dur=650, t0=performance.now();
    (function frame(t){ const k=Math.min(1,(t-t0)/dur); const e=1-Math.pow(1-k,3);
      el.textContent=fmt(to*e); if(k<1) requestAnimationFrame(frame); else el.textContent=fmt(to); })(t0);
  }

  async function dashboard(c){
    await noShowScan();
    const m = await metrics();
    const settings = await MKR.db.meta('settings') || {};
    const orders = await MKR.db.getAll('orders');
    const paid = orders.filter(o=>o.paid && o.status!=='cancelled' && o.status!=='refunded');

    // 7-day revenue series
    const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const today=new Date(); today.setHours(0,0,0,0);
    const days=[]; for(let i=6;i>=0;i--){ const d=new Date(today); d.setDate(d.getDate()-i);
      const iso=d.toISOString().slice(0,10);
      const rev=paid.filter(o=>new Date(o.createdAt).toISOString().slice(0,10)===iso).reduce((s,o)=>s+o.total,0);
      days.push({label:DOW[d.getDay()], rev}); }
    const maxRev=Math.max(1,...days.map(d=>d.rev));

    // Best sellers (last 7 days)
    const cut=today.getTime()-6*864e5; const sell={};
    paid.filter(o=>o.createdAt>=cut).forEach(o=>(o.items||[]).forEach(it=>{ sell[it.nm]=(sell[it.nm]||0)+(it.qty||0); }));
    const best=Object.entries(sell).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const maxQ=Math.max(1,...best.map(b=>b[1]));

    // Labor ratio
    const staff=(await MKR.db.getAll('users')).filter(u=>u.role==='staff'&&!u.offboarded);
    const shifts=await MKR.db.getAll('shifts');
    const wage=shifts.reduce((t,s)=>{ const st=staff.find(x=>x.id===s.staffId)||{baseRate:0,employment:'casual'}; return t+MKR.pay.shiftPay(st,s,MKR.seed.dayTs(s.day)).pay; },0);
    const fc=settings.revenueForecast||1; const laborPct=wage/fc; const redline=settings.laborPctThreshold||0.28;
    const gMax=Math.max(redline*1.6, laborPct*1.15, 0.35);
    const overLabor=laborPct>redline;
    const avg=m.count?m.revenue/m.count:0;
    const vNeg=m.variance!=null && Math.abs(m.variance)>(settings.cashVarianceThreshold||20);

    // Live: staff on shift right now + the busiest 15-minute window (from order timestamps)
    const nowD=new Date(); const todayIdx=(nowD.getDay()+6)%7; const nowMin=nowD.getHours()*60+nowD.getMinutes();
    const onNow=new Set(shifts.filter(s=>{ if(s.day!==todayIdx||!s.start||!s.end) return false;
      const [sh,sm]=String(s.start).split(':').map(Number), [eh,em]=String(s.end).split(':').map(Number);
      return nowMin>=(sh*60+sm) && nowMin<(eh*60+em); }).map(s=>s.staffId)).size;
    const buckets={}; paid.forEach(o=>{ const d=new Date(o.createdAt); buckets[d.getHours()*4+Math.floor(d.getMinutes()/15)]=(buckets[d.getHours()*4+Math.floor(d.getMinutes()/15)]||0)+1; });
    let peak=null,peakN=0; for(const k in buckets){ if(buckets[k]>peakN){ peakN=buckets[k]; peak=+k; } }
    const pad2=n=>String(n).padStart(2,'0'); const fmtMin=mins=>pad2(Math.floor(mins/60)%24)+':'+pad2(mins%60);
    const peakLabel = peak==null?'—':`${fmtMin(peak*15)}–${fmtMin(peak*15+15)}`;

    const tile=(href,ic,label,valHtml,delta,deltaCls)=>`<a class="card ds-tile clickable" href="${href}">
      <div class="ds-ico">${icon(ic)}</div>
      <div class="ds-tile-body"><span class="ds-tile-label">${label}</span><span class="ds-tile-val">${valHtml}</span><span class="ds-tile-delta ${deltaCls||''}">${delta}</span></div></a>`;

    c.innerHTML = `
      <div class="section-head"><div><h2>Dashboard</h2><p>Runs quietly — only pings you when something's wrong</p></div></div>

      <div class="ds-hero card">
        <div class="ds-hero-main">
          <span class="ds-hero-label">${icon('revenue')} Today's revenue</span>
          <span class="ds-hero-value" id="heroRev">${U.money(0)}</span>
          <span class="ds-hero-sub">${m.count} order${m.count===1?'':'s'} today · live</span>
          <div class="ds-mini-row">
            <div class="ds-mini"><span>🟢 On shift now</span><b>${onNow}</b></div>
            <div class="ds-mini"><span>Busiest 15-min</span><b style="font-size:15px">${peakLabel}</b></div>
            <div class="ds-mini"><span>Cash variance</span><b style="color:${vNeg?'var(--red)':'inherit'}">${m.variance==null?'—':(m.variance>=0?'+':'')+U.money0(m.variance)}</b></div>
            <div class="ds-mini"><span>Unread alerts</span><b style="color:${m.alerts.length?'var(--red)':'inherit'}">${m.alerts.length}</b></div>
          </div>
        </div>
        <div class="ds-hero-chart">
          <div class="ds-chart-cap">Last 7 days revenue</div>
          <div class="ds-bars">${days.map(d=>`<div class="ds-bar-wrap"><div class="ds-bar" data-h="${Math.round(d.rev/maxRev*100)}" title="${U.money0(d.rev)}"></div></div>`).join('')}</div>
          <div class="ds-bars-x">${days.map(d=>`<span>${d.label}</span>`).join('')}</div>
        </div>
      </div>

      <div class="grid g4" style="margin:16px 0">
        ${tile('#/owner/report','orders','Today\'s orders', `<span id="kOrders">0</span>`, 'View report ›','')}
        ${tile('#/owner/report','avg','Avg order value', `<span id="kAvg">${U.money(0)}</span>`, 'per paid order','')}
        ${tile('#/owner/labor','labor','Labor ratio', `<span id="kLabor">0.00</span><small>%</small>`, overLabor?'Over red line ›':'Healthy ›', overLabor?'down':'up')}
        ${tile('#/owner/alerts','bell','Unread alerts', `<span style="color:${m.alerts.length?'var(--red)':'inherit'}">${m.alerts.length}</span>`, m.alerts.length?'Needs attention ›':'All good ›','')}
      </div>

      <div class="grid g2" style="align-items:start">
        <div class="card pad20">
          <div class="section-title">${icon('chart')} Best sellers · last 7 days</div>
          <div class="bestlist">${best.length? best.map(([nm,q])=>`
            <div class="bestrow"><span class="bestnm">${U.esc(nm)}</span><div class="besttrack"><div class="bestfill" data-w="${Math.round(q/maxQ*100)}"></div></div><b class="bestq">${q}</b></div>`).join('')
            : '<div class="empty" style="padding:18px"><div class="em">🍽️</div><p>No sales in the last 7 days</p></div>'}</div>
        </div>
        <div class="card pad20">
          <div class="section-title">${icon('labor')} Labor cost ratio</div>
          <div class="gauge-val" style="color:${overLabor?'var(--red)':'var(--green)'}">${U.round2(laborPct*100).toFixed(2)}<small>%</small></div>
          <div class="gauge"><div class="gauge-fill" data-w="${Math.min(100,laborPct/gMax*100).toFixed(1)}" style="background:${overLabor?'var(--red)':'var(--accent)'}"></div><div class="gauge-line" style="left:${Math.min(100,redline/gMax*100).toFixed(1)}%"></div></div>
          <div class="gauge-legend"><span>Rostered ${U.money0(wage)}</span><span>Red line ${U.round2(redline*100).toFixed(0)}%</span></div>
          <div class="alert ${overLabor?'red':'green'} mt12" style="font-size:13px"><span>${overLabor?'⚠️':'✅'}</span><div>${overLabor?'Over the red line — review in Labor cost.':'Within the healthy range.'}</div></div>
        </div>
      </div>

      <div class="grid g2 mt16" style="align-items:start">
        <div class="card pad20">
          <div class="section-title">${icon('bell')} Alerts · only when it matters<a href="#/owner/alerts" class="faint" style="font-size:12px">All →</a></div>
          <div id="aprev"></div>
        </div>
        <div class="card pad20">
          <div class="section-title">${icon('calendar')} Today at a glance<a href="#/owner/report" class="faint" style="font-size:12px">Full report →</a></div>
          <div class="list">
            <a class="li clickable" href="#/owner/report"><div class="ds-li-ic">${icon('revenue')}</div><div class="meta"><b>${U.money(m.revenue)}</b><span>Today's revenue</span></div><span class="faint">›</span></a>
            <a class="li clickable" href="#/owner/report"><div class="ds-li-ic">${icon('cash')}</div><div class="meta"><b>${m.variance==null?'Not reconciled':(m.variance>=0?'+':'')+U.money(m.variance)}</b><span>Cash blind-drop variance</span></div><span class="faint">›</span></a>
            <a class="li clickable" href="#/owner/compliance"><div class="ds-li-ic">${icon('calendar')}</div><div class="meta"><b>8 tables</b><span>Tomorrow's bookings (demo)</span></div><span class="faint">›</span></a>
          </div>
        </div>
      </div>
      <div class="disclaimer mt16"><span>ℹ️</span>This system aggregates and exports data; it does not connect to the ATO or give tax advice — final tax figures are confirmed by your accountant.</div>`;

    // Count-ups + animated bars
    countUp(U.qs('#heroRev',c), m.revenue, v=>U.money(v));
    countUp(U.qs('#kOrders',c), m.count, v=>String(Math.round(v)));
    countUp(U.qs('#kAvg',c), avg, v=>U.money(v));
    countUp(U.qs('#kLabor',c), laborPct*100, v=>U.round2(v).toFixed(2));
    requestAnimationFrame(()=>{
      U.qsa('.ds-bar',c).forEach(b=> b.style.height=b.dataset.h+'%');
      U.qsa('.bestfill',c).forEach(b=> b.style.width=b.dataset.w+'%');
      U.qsa('.gauge-fill',c).forEach(b=> b.style.width=b.dataset.w+'%');
    });

    const ap = U.qs('#aprev',c);
    const red = m.alerts.slice(0,4);
    ap.innerHTML = red.length? red.map(a=>`<div class="alert ${a.level==='red'?'red':'amber'}" style="margin-bottom:10px"><span>${a.level==='red'?'⚠️':'🔔'}</span><div><b>${U.esc(a.title)}</b><br>${U.esc(a.desc)} · <span class="faint">${U.ago(a.ts)}</span></div></div>`).join('')
      : `<div class="empty"><div class="em">😌</div><p>No issues — running quietly</p></div>`;
  }

  // ---------- Sales analytics ----------
  async function analytics(c){
    const orders = await MKR.db.getAll('orders');
    const paid = orders.filter(o=>o.paid && o.status!=='cancelled' && o.status!=='refunded');
    const now=Date.now(); const cut30=now-30*864e5;
    const p30 = paid.filter(o=>o.createdAt>=cut30);
    const rev30=p30.reduce((s,o)=>s+o.total,0), ord30=p30.length, avg=ord30?rev30/ord30:0;

    // 14-day revenue series
    const today=new Date(); today.setHours(0,0,0,0);
    const days=[]; for(let i=13;i>=0;i--){ const d=new Date(today); d.setDate(d.getDate()-i); const iso=d.toISOString().slice(0,10);
      days.push({label:(d.getMonth()+1)+'/'+d.getDate(), rev:paid.filter(o=>new Date(o.createdAt).toISOString().slice(0,10)===iso).reduce((s,o)=>s+o.total,0)}); }
    const maxRev=Math.max(1,...days.map(d=>d.rev));

    // sellers (last 30d)
    const sell={}; p30.forEach(o=>(o.items||[]).forEach(it=>{ sell[it.nm]=(sell[it.nm]||0)+(it.qty||0); }));
    const sorted=Object.entries(sell).sort((a,b)=>b[1]-a[1]);
    const top=sorted.slice(0,5), bottom=sorted.length>5?sorted.slice(-3).reverse():[];
    const maxQ=Math.max(1,...sorted.map(s=>s[1]));

    // day-parts
    const PARTS=[['Morning',6,11],['Lunch',11,15],['Afternoon',15,17],['Dinner',17,22],['Late night',22,30]];
    const partRev=PARTS.map(([label,a,b])=>({label, rev:p30.filter(o=>{ let h=new Date(o.createdAt).getHours(); if(b>24&&h<6)h+=24; return h>=a&&h<b; }).reduce((s,o)=>s+o.total,0)}));
    const maxPart=Math.max(1,...partRev.map(p=>p.rev));
    const busiest=partRev.slice().sort((a,b)=>b.rev-a.rev)[0];

    // payment mix
    const cash=p30.filter(o=>o.method==='cash').length, card=ord30-cash;
    const cashPct=ord30?Math.round(cash/ord30*100):0;

    // best-seller trend: top-3 dishes' daily quantity over the last 14 days
    const dayKeys=[]; for(let i=13;i>=0;i--){ const d=new Date(today); d.setDate(d.getDate()-i); dayKeys.push(d.toISOString().slice(0,10)); }
    const trend = sorted.slice(0,3).map(([nm])=>{
      const series = dayKeys.map(iso=> paid.filter(o=>new Date(o.createdAt).toISOString().slice(0,10)===iso)
        .reduce((s,o)=>s+(o.items||[]).filter(it=>it.nm===nm).reduce((q,it)=>q+(it.qty||0),0),0));
      return { nm, series, mx:Math.max(1,...series) };
    });
    // foot traffic: order count per hour of day (last 30 days), across opening hours
    const HRS=[]; for(let h=8;h<=23;h++) HRS.push(h);
    const hourCount = HRS.map(h=> p30.filter(o=>new Date(o.createdAt).getHours()===h).length);
    const maxHr=Math.max(1,...hourCount);

    const I=(n)=> MKR.ui?MKR.ui.icon(n):'';
    const tile=(ic,label,val,sub)=>`<div class="card ds-tile"><div class="ds-ico">${I(ic)}</div><div class="ds-tile-body"><span class="ds-tile-label">${label}</span><span class="ds-tile-val">${val}</span><span class="ds-tile-delta">${sub||''}</span></div></div>`;
    const barRow=(label,val,max,fmt)=>`<div class="bestrow"><span class="bestnm">${U.esc(label)}</span><div class="besttrack"><div class="bestfill" data-w="${Math.round(val/max*100)}"></div></div><b class="bestq">${fmt(val)}</b></div>`;

    c.innerHTML=`
      <div class="section-head"><div><h2>Analytics</h2><p>What's making money — last 30 days of sales, sellers and patterns</p></div></div>
      <div class="grid g4" style="margin-bottom:16px">
        ${tile('grid','Revenue (30 days)', U.money0(rev30))}
        ${tile('receipt','Orders (30 days)', ord30)}
        ${tile('avg','Avg order value', U.money(avg))}
        ${tile('clock','Busiest period', busiest&&busiest.rev>0?busiest.label:'—')}
      </div>

      <div class="card pad20" style="margin-bottom:16px">
        <div class="section-title">${I('bars')} Revenue · last 14 days</div>
        <div class="ds-bars" style="margin-top:6px">${days.map(d=>`<div class="ds-bar-wrap"><div class="ds-bar" data-h="${Math.round(d.rev/maxRev*100)}" title="${U.money0(d.rev)}"></div></div>`).join('')}</div>
        <div class="ds-bars-x">${days.map((d,i)=>`<span>${i%2===0?d.label:''}</span>`).join('')}</div>
      </div>

      <div class="grid g2" style="align-items:start">
        <div class="card pad20">
          <div class="section-title">${I('star')} Top sellers · 30 days</div>
          <div class="bestlist">${top.length? top.map(([nm,q])=>barRow(nm,q,maxQ,v=>v)).join('') : '<div class="empty" style="padding:16px"><div class="em">🍽️</div><p>No sales yet</p></div>'}</div>
          ${bottom.length?`<div class="section-title mt16">${I('repeat')} Slow movers</div><div class="bestlist">${bottom.map(([nm,q])=>barRow(nm,q,maxQ,v=>v)).join('')}</div>`:''}
        </div>
        <div class="card pad20">
          <div class="section-title">${I('clock')} Revenue by time of day</div>
          <div class="bestlist">${partRev.map(p=>barRow(p.label,p.rev,maxPart,v=>U.money0(v))).join('')}</div>
          <div class="section-title mt16">${I('receipt')} Payment mix</div>
          <div class="gauge"><div class="gauge-fill" data-w="${cashPct}" style="background:var(--green)"></div></div>
          <div class="gauge-legend"><span>💵 Cash ${cash} (${cashPct}%)</span><span>💳 Card ${card} (${100-cashPct}%)</span></div>
        </div>
      </div>

      <div class="grid g2 mt16" style="align-items:start">
        <div class="card pad20">
          <div class="section-title">${I('trend')} Best-seller trend · 14 days</div>
          ${trend.length? trend.map(t=>`
            <div style="margin-top:12px"><div style="font-size:12.5px;font-weight:600;margin-bottom:4px">${U.esc(t.nm)}</div>
            <div class="ds-bars" style="height:42px">${t.series.map(v=>`<div class="ds-bar-wrap"><div class="ds-bar" data-h="${Math.round(v/t.mx*100)}" title="${v}"></div></div>`).join('')}</div></div>`).join('')
            : '<div class="empty" style="padding:16px"><div class="em">📈</div><p>No sales yet</p></div>'}
        </div>
        <div class="card pad20">
          <div class="section-title">${I('users')} Foot traffic by hour · 30 days</div>
          <div class="ds-bars" style="margin-top:6px;height:96px">${hourCount.map((v,i)=>`<div class="ds-bar-wrap"><div class="ds-bar" data-h="${Math.round(v/maxHr*100)}" title="${HRS[i]}:00 · ${v} orders"></div></div>`).join('')}</div>
          <div class="ds-bars-x">${HRS.map((h,i)=>`<span>${i%3===0?h:''}</span>`).join('')}</div>
        </div>
      </div>
      <div class="disclaimer mt16"><span>📈</span>Figures cover paid orders across your venues for the last 30 days. Use them to plan menu, staffing and promotions — they don't constitute financial advice.</div>`;

    requestAnimationFrame(()=>{
      U.qsa('.ds-bar',c).forEach(b=> b.style.height=b.dataset.h+'%');
      U.qsa('.bestfill',c).forEach(b=> b.style.width=b.dataset.w+'%');
      U.qsa('.gauge-fill',c).forEach(b=> b.style.width=b.dataset.w+'%');
    });
  }

  // ---------- Staff performance points ----------
  async function performanceView(c){
    const settings = await MKR.db.meta('settings') || {};
    const W = Object.assign({perOrder:2, perOnTime:5, perTask:3, errorPenalty:8}, settings.perfWeights||{});
    const kid = (MKR.auth.current()&&MKR.auth.current().kitchenId)||'k_main';
    const staff = (await MKR.db.getAll('users')).filter(u=>u.role==='staff' && !u.offboarded && (u.kitchenId||'k_main')===kid);
    const orders = await MKR.db.getAll('orders');
    const clockins = await MKR.db.getAll('clockins');
    const tasks = await MKR.db.getAll('tasks');
    const cut = Date.now()-30*864e5;

    const rows = staff.map(s=>{
      const mine = orders.filter(o=>o.serverId===s.id && (o.createdAt||0)>=cut);
      const served = mine.filter(o=>o.paid && o.status!=='cancelled' && o.status!=='refunded');
      const errors = mine.filter(o=>o.status==='refunded'||o.status==='cancelled').length;
      const durs = served.filter(o=>o.updatedAt&&o.createdAt).map(o=>(o.updatedAt-o.createdAt)/60000).filter(m=>m>0&&m<240);
      const avgPrep = durs.length? durs.reduce((a,b)=>a+b,0)/durs.length : null;
      const onTime = clockins.filter(k=>k.staffId===s.id && (k.clockTs||0)>=cut && !k.late).length;
      const tasksDone = tasks.filter(t=>t.done && t.by===s.name).length;
      const bonus = (s.rewards||[]).reduce((a,r)=>a+(r.points||0),0);
      const points = Math.max(0, Math.round(served.length*W.perOrder + onTime*W.perOnTime + tasksDone*W.perTask - errors*W.errorPenalty + bonus));
      return { s, orders:served.length, errors, avgPrep, onTime, tasks:tasksDone, bonus, points, lastReward:(s.rewards||[]).slice(-1)[0] };
    }).sort((a,b)=>b.points-a.points);
    const maxPts = Math.max(1,...rows.map(r=>r.points));

    c.innerHTML = `
      <div class="section-head"><div><h2>Staff performance</h2><p>Auto points from orders served, on-time clock-ins and tasks — minus refunds/cancels. Reward your top performers.</p></div>
        <button class="btn btn-ghost btn-sm" id="ptsCfg">⚙️ Points settings</button></div>
      <div class="card pad20"><div class="bestlist" id="lb"></div></div>
      <div class="disclaimer mt16"><span>🏅</span>Points are an internal incentive metric over the last 30 days — not a formal performance review.</div>`;

    const lb = U.qs('#lb',c);
    lb.innerHTML = rows.length ? rows.map((r,i)=>{
      const medal = ['🥇','🥈','🥉'][i] || `#${i+1}`;
      return `<div class="li"><div class="ava">${r.s.emoji||U.initials(r.s.name)}</div>
        <div class="meta"><b>${medal} ${U.esc(r.s.name)} ${r.lastReward?`<span class="pill ok">🎁 ${U.esc(r.lastReward.note||'rewarded')}</span>`:''}</b>
          <span>${r.orders} orders · ${r.onTime} on-time · ${r.tasks} tasks${r.errors?` · <span style="color:var(--red)">${r.errors} errors</span>`:''}${r.avgPrep!=null?` · ~${r.avgPrep.toFixed(0)}m prep`:''}</span>
          <div class="bar" style="margin-top:6px"><i style="width:${Math.round(r.points/maxPts*100)}%"></i></div></div>
        <div class="row gap6 center"><b style="font-family:'Playfair Display',serif;font-size:18px">${r.points}</b><button class="btn btn-ghost btn-sm" data-reward="${r.s.id}">🎁 Reward</button></div></div>`;
    }).join('') : '<div class="empty"><div class="em">🏅</div><p>No staff yet</p></div>';
    U.qsa('[data-reward]',lb).forEach(b=>b.onclick=()=>rewardModal((rows.find(r=>r.s.id===b.dataset.reward)||{}).s));
    U.qs('#ptsCfg',c).onclick=cfgModal;

    function cfgModal(){
      const f=(id,label,val)=>`<div class="row center" style="gap:10px;margin-bottom:8px"><div class="grow" style="font-size:14px">${label}</div><input class="input" id="${id}" type="number" min="0" value="${val}" style="width:90px;text-align:right"></div>`;
      const wrap=U.el(`<div><div class="disclaimer" style="margin-bottom:12px"><span>⚙️</span>Set how many points each action is worth (last 30 days, all staff).</div>
        ${f('w_o','Points per order served',W.perOrder)}${f('w_t','Points per on-time clock-in',W.perOnTime)}${f('w_k','Points per task done',W.perTask)}${f('w_e','Penalty per refund / cancel',W.errorPenalty)}</div>`);
      U.modal('Points settings', wrap, {actions:[{label:'Save', class:'btn-dark', onClick:async(cl)=>{
        const s=await MKR.db.meta('settings')||{};
        s.perfWeights={perOrder:+U.qs('#w_o',wrap).value||0, perOnTime:+U.qs('#w_t',wrap).value||0, perTask:+U.qs('#w_k',wrap).value||0, errorPenalty:+U.qs('#w_e',wrap).value||0};
        await MKR.db.meta('settings',s); cl(); U.toast('Points settings saved','green'); performanceView(c);
      }}]});
    }
    function rewardModal(su){ if(!su) return;
      const wrap=U.el(`<div>
        <div class="field"><label>Reward / recognition</label><input class="input" id="r_note" placeholder="e.g. $50 bonus · Employee of the month"></div>
        <div class="field"><label>Bonus points (optional)</label><input class="input" id="r_pts" type="number" min="0" value="0"></div></div>`);
      U.modal('🎁 Reward '+U.esc(su.name), wrap, {actions:[{label:'Give reward', class:'btn-green', onClick:async(cl)=>{
        const note=U.qs('#r_note',wrap).value.trim(); if(!note){ U.toast('Enter a reward','red'); return; }
        const pts=Math.max(0,+U.qs('#r_pts',wrap).value||0);
        const u=await MKR.db.get('users',su.id)||{}; const rewards=(u.rewards||[]).concat([{ts:Date.now(),note,points:pts,by:(MKR.auth.current()||{}).name}]);
        await MKR.db.put('users',{id:su.id, rewards});
        await MKR.audit.log({action:'reward', desc:`Rewarded ${su.name}: ${note}${pts?` (+${pts} pts)`:''}`});
        cl(); U.toast('Reward recorded 🎁','green'); performanceView(c);
      }}]});
    }
  }

  // ---------- Membership: points · stored value · coupons · repurchase analysis ----------
  async function membership(c){
    const M = MKR.membership;
    const cfg = await M.config();
    const members = await M.all();
    const coupons = await M.allCoupons();
    const orders = (await MKR.db.getAll('orders')).filter(o=>o.status!=='cancelled' && o.status!=='refunded');

    const totalPts = members.reduce((a,m)=>a+(m.points||0),0);
    const totalBal = members.reduce((a,m)=>a+(m.balance||0),0);
    const repeat = members.filter(m=>(m.visits||0)>1).length;
    const repeatRate = members.length ? Math.round(repeat/members.length*100) : 0;

    // Frequently-bought-together: count unordered item-name pairs per order
    const pairCount = {};
    orders.forEach(o=>{
      const names=[...new Set((o.items||[]).map(i=>i.nm).filter(Boolean))];
      for(let i=0;i<names.length;i++) for(let j=i+1;j<names.length;j++){
        const k=[names[i],names[j]].sort().join('  +  '); pairCount[k]=(pairCount[k]||0)+1;
      }
    });
    const combos = Object.entries(pairCount).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const maxCombo = combos.length?combos[0][1]:1;

    // Top members by spend
    const topMembers = members.slice().sort((a,b)=>(b.spent||0)-(a.spent||0)).slice(0,5);
    const maxSpent = topMembers.length?(topMembers[0].spent||1):1;

    const activeCoupons = coupons.filter(x=>!x.used).length;

    c.innerHTML = `
      <div class="section-head"><div><h2>Membership</h2><p>Loyalty points, stored value and e-coupons — plus repurchase & combo analysis. ${cfg.pointsPerDollar} pt / $1 · 100 pts = ${U.money(100*cfg.centsPerPoint/100)}.</p></div>
        <div class="row gap8 wrap"><button class="btn btn-ghost btn-sm" id="expMembers">⬇️ Export members</button>
        <button class="btn btn-ghost btn-sm" id="loyCfg">⚙️ Loyalty settings</button></div></div>

      <div class="grid g4 mt8">
        <div class="card stat"><div class="k">🪪 Members</div><div class="v">${members.length}</div></div>
        <div class="card stat"><div class="k">🔁 Repurchase rate</div><div class="v">${repeatRate}<small>%</small></div><div class="delta flat">${repeat} returning</div></div>
        <div class="card stat"><div class="k">⭐ Points outstanding</div><div class="v">${totalPts}</div></div>
        <div class="card stat"><div class="k">💰 Stored value</div><div class="v">${U.money0(totalBal)}</div></div>
      </div>

      <div class="grid g2 mt16">
        <div class="card pad20">
          <div class="section-title">🔁 Frequently bought together</div>
          <div id="combos">${combos.length?combos.map(([k,n])=>`
            <div class="li"><div class="meta"><b>${U.esc(k)}</b>
              <div class="bar" style="margin-top:6px"><i style="width:${Math.round(n/maxCombo*100)}%"></i></div></div>
              <b>${n}×</b></div>`).join(''):'<div class="empty"><p>Not enough order history yet</p></div>'}</div>
        </div>
        <div class="card pad20">
          <div class="section-title">💎 Top members by spend</div>
          <div id="topMem">${topMembers.length?topMembers.map((m,i)=>`
            <div class="li"><div class="ava">${['🥇','🥈','🥉'][i]||'#'+(i+1)}</div>
              <div class="meta"><b>${U.esc(m.name)}</b><span>${m.visits||0} visits · ⭐ ${m.points||0} pts</span>
                <div class="bar" style="margin-top:6px"><i style="width:${Math.round((m.spent||0)/maxSpent*100)}%"></i></div></div>
              <b>${U.money(m.spent||0)}</b></div>`).join(''):'<div class="empty"><p>No members yet</p></div>'}</div>
        </div>
      </div>

      <div class="card pad20 mt16">
        <div class="section-head" style="margin-bottom:10px"><div class="section-title" style="margin:0">🎟️ Coupons <span class="muted" style="font-weight:400">· ${activeCoupons} active</span></div>
          <button class="btn btn-dark btn-sm" id="issueCpn">＋ Issue coupon</button></div>
        <div id="cpnList"></div>
      </div>

      <div class="card pad20 mt16">
        <div class="section-head" style="margin-bottom:10px"><div class="section-title" style="margin:0">🪪 Members</div>
          <input class="input" id="memSearch" placeholder="Search name / phone / code" style="height:38px;max-width:240px"></div>
        <div id="memList"></div>
      </div>`;

    // ----- coupon list -----
    function drawCoupons(){
      const list=U.qs('#cpnList',c);
      const sorted=coupons.slice().sort((a,b)=>(a.used-b.used)||(b.createdAt-a.createdAt));
      list.innerHTML = sorted.length ? sorted.map(cp=>`
        <div class="li">
          <div class="ava">🎟️</div>
          <div class="meta"><b>${cp.code} · ${cp.type==='pct'?cp.value+'% off':U.money(cp.value)+' off'}</b>
            <span>${cp.minSpend?'min '+U.money(cp.minSpend)+' · ':''}${cp.memberId?'member '+cp.memberId:'public'}${cp.expiry?' · exp '+cp.expiry:''}</span></div>
          <span class="pill ${cp.used?'danger':'ok'}">${cp.used?'Used':'Active'}</span>
        </div>`).join('') : '<div class="empty"><div class="em">🎟️</div><p>No coupons yet</p></div>';
    }
    drawCoupons();

    // ----- member list (searchable) -----
    function drawMembers(q){
      const list=U.qs('#memList',c);
      const ql=(q||'').trim().toLowerCase();
      const rows=members.filter(m=>!ql || (m.name||'').toLowerCase().includes(ql) || (m.phone||'').includes(ql) || (m.id||'').toLowerCase().includes(ql))
        .sort((a,b)=>(b.updatedAt||b.createdAt||0)-(a.updatedAt||a.createdAt||0));
      list.innerHTML = rows.length ? rows.map(m=>`
        <div class="li" data-mem="${m.id}" style="cursor:pointer">
          <div class="ava">${U.initials(m.name)}</div>
          <div class="meta"><b>${U.esc(m.name)} <span class="pill ok">${m.id}</span></b>
            <span>⭐ ${m.points||0} pts · 💰 ${U.money(m.balance||0)} · ${m.visits||0} visits${m.phone?' · '+U.esc(m.phone):''}</span></div>
          <span class="muted" style="font-size:20px;line-height:1">›</span>
        </div>`).join('') : '<div class="empty"><div class="em">🪪</div><p>No members yet — add them at checkout in POS</p></div>';
      U.qsa('[data-mem]',list).forEach(b=>b.onclick=()=>memberDetail(members.find(m=>m.id===b.dataset.mem)));
    }
    drawMembers('');
    U.qs('#memSearch',c).oninput=(e)=>drawMembers(e.target.value);

    U.qs('#loyCfg',c).onclick=loyaltyModal;
    U.qs('#issueCpn',c).onclick=()=>couponModal();
    U.qs('#expMembers',c).onclick=()=>{
      if(!members.length){ U.toast('No members to export','amber'); return; }
      const rows=[['Code','Name','Phone','Points','Balance','Visits','Total spent','Joined']];
      members.forEach(m=>rows.push([m.id, m.name||'', m.phone||'', m.points||0, (Number(m.balance)||0).toFixed(2), m.visits||0, (Number(m.spent)||0).toFixed(2), m.createdAt?U.fmtDate(m.createdAt):'']));
      U.downloadCSV(`members-${U.todayISO()}.csv`, rows);
      U.toast('Members exported','green');
    };

    // ----- loyalty settings -----
    function loyaltyModal(){
      const f=(id,label,val,hint)=>`<div class="field"><label>${label}</label><input class="input" id="${id}" type="number" min="0" value="${val}">${hint?`<div class="muted" style="font-size:12px;margin-top:4px">${hint}</div>`:''}</div>`;
      const wrap=U.el(`<div>${f('l_per','Points earned per $1 spent',cfg.pointsPerDollar)}${f('l_cpp','Redemption value — cents per point',cfg.centsPerPoint,'1 = 100 pts worth $1')}${f('l_bonus','Sign-up bonus points',cfg.signupBonus)}</div>`);
      U.modal('Loyalty settings', wrap, {actions:[{label:'Save', class:'btn-dark', onClick:async(cl)=>{
        await M.saveConfig({ pointsPerDollar:+U.qs('#l_per',wrap).value||0, centsPerPoint:+U.qs('#l_cpp',wrap).value||1, signupBonus:+U.qs('#l_bonus',wrap).value||0 });
        cl(); U.toast('Loyalty settings saved','green'); membership(c);
      }}]});
    }

    // ----- issue coupon -----
    function couponModal(memberId){
      const wrap=U.el(`<div>
        <div class="cat-tabs" id="ct"><button class="active" data-t="pct">% off</button><button data-t="amt">$ off</button></div>
        <div class="field mt8"><label id="vLbl">Percent off</label><input class="input" id="cv" type="number" min="0" value="10"></div>
        <div class="field"><label>Minimum spend (optional)</label><input class="input" id="cmin" type="number" min="0" value="0"></div>
        <div class="field"><label>Expiry date (optional)</label><input class="input" id="cexp" type="date"></div>
        ${memberId?`<div class="alert info"><span>🪪</span><div>Issued to member <b>${memberId}</b></div></div>`:`<div class="field"><label>How many codes</label><input class="input" id="ccount" type="number" min="1" max="200" value="1"></div>`}
      </div>`);
      let type='pct';
      U.qsa('#ct button',wrap).forEach(b=>b.onclick=()=>{ U.qsa('#ct button',wrap).forEach(x=>x.classList.remove('active')); b.classList.add('active'); type=b.dataset.t; U.qs('#vLbl',wrap).textContent=type==='pct'?'Percent off':'Amount off ($)'; });
      U.modal(memberId?'Issue member coupon':'Issue coupons', wrap, {actions:[{label:'Issue', class:'btn-green', onClick:async(cl)=>{
        const made=await M.issueCoupon({ type, value:+U.qs('#cv',wrap).value||0, minSpend:+U.qs('#cmin',wrap).value||0,
          expiry:U.qs('#cexp',wrap).value||null, memberId:memberId||null, count:memberId?1:(+U.qs('#ccount',wrap).value||1) });
        cl(); U.toast(`Issued ${made.length} coupon(s) · ${made[0].code}`,'green'); membership(c);
      }}]});
    }

    // ----- member detail -----
    function memberDetail(m){
      if(!m) return;
      const hist=(m.history||[]).slice().reverse().slice(0,12);
      const histHtml=hist.length?hist.map(h=>{
        const t=U.fmtDateTime(h.ts);
        if(h.type==='order') return `<div class="li"><div class="meta"><b>Order #${(h.orderId||'').slice(-4)}</b><span>${t} · paid ${U.money(h.paid)}${h.earned?` · +${h.earned} pts`:''}${h.redeemed?` · −${h.redeemed} pts`:''}${h.balanceUsed?` · −${U.money(h.balanceUsed)} bal`:''}</span></div></div>`;
        if(h.type==='topup') return `<div class="li"><div class="meta"><b>💰 Top-up ${U.money(h.amount)}</b><span>${t} · ${h.method||''} · by ${U.esc(h.by||'')}</span></div></div>`;
        if(h.type==='adjust') return `<div class="li"><div class="meta"><b>⭐ ${h.points>=0?'+':''}${h.points} pts</b><span>${t}${h.note?' · '+U.esc(h.note):''} · by ${U.esc(h.by||'')}</span></div></div>`;
        if(h.type==='signup') return `<div class="li"><div class="meta"><b>🎁 Welcome bonus +${h.points} pts</b><span>${t}</span></div></div>`;
        return '';
      }).join(''):'<div class="empty" style="padding:16px"><p>No activity yet</p></div>';
      const wrap=U.el(`<div>
        <div class="mem-detail">
          <div class="qr-wrap">${MKR.ui.qr(m.id,128)}<div class="qr-code">${m.id}</div></div>
          <div class="grow">
            <div class="row gap8"><div class="kv"><div class="muted">Points</div><b>⭐ ${m.points||0}</b></div>
              <div class="kv"><div class="muted">Balance</div><b>💰 ${U.money(m.balance||0)}</b></div>
              <div class="kv"><div class="muted">Visits</div><b>${m.visits||0}</b></div>
              <div class="kv"><div class="muted">Spent</div><b>${U.money(m.spent||0)}</b></div></div>
            <div class="row gap8 mt12 wrap">
              <button class="btn btn-dark btn-sm" id="mdTop">💰 Top up</button>
              <button class="btn btn-ghost btn-sm" id="mdAdj">⭐ Adjust points</button>
              <button class="btn btn-ghost btn-sm" id="mdCpn">🎟️ Give coupon</button>
            </div>
          </div>
        </div>
        <div class="section-title mt16">Recent activity</div>
        <div>${histHtml}</div>
      </div>`);
      const dm=U.modal(`${m.name} · ${m.phone||'no phone'}`, wrap);
      U.qs('#mdTop',wrap).onclick=()=>{
        const tw=U.el(`<div><div class="field"><label>Top-up amount</label><input class="input" id="ta" type="number" min="0" placeholder="0.00"></div>
          <div class="cat-tabs" id="tm"><button class="active" data-m="cash">💵 Cash</button><button data-m="card">💳 Card</button></div></div>`);
        let tmethod='cash'; U.qsa('#tm button',tw).forEach(b=>b.onclick=()=>{ U.qsa('#tm button',tw).forEach(x=>x.classList.remove('active')); b.classList.add('active'); tmethod=b.dataset.m; });
        U.modal('Top up '+m.name, tw, {actions:[{label:'Add to balance', class:'btn-green', onClick:async(cl)=>{
          const amt=+U.qs('#ta',tw).value||0; if(amt<=0){ U.toast('Enter an amount','red'); return; }
          await M.topUp(m.id, amt, tmethod); cl(); dm.close(); U.toast(`Topped up ${U.money(amt)}`,'green'); membership(c);
        }}]});
      };
      U.qs('#mdAdj',wrap).onclick=()=>{
        const aw=U.el(`<div><div class="field"><label>Points (use − to deduct)</label><input class="input" id="ap" type="number" value="0"></div>
          <div class="field"><label>Note</label><input class="input" id="an" placeholder="e.g. goodwill, correction"></div></div>`);
        U.modal('Adjust points · '+m.name, aw, {actions:[{label:'Apply', class:'btn-dark', onClick:async(cl)=>{
          await M.adjustPoints(m.id, +U.qs('#ap',aw).value||0, U.qs('#an',aw).value.trim()); cl(); dm.close(); U.toast('Points adjusted','green'); membership(c);
        }}]});
      };
      U.qs('#mdCpn',wrap).onclick=()=>{ dm.close(); couponModal(m.id); };
    }
  }

  // ---------- Daily report ----------
  async function report(c){
    const m = await metrics();
    const line = `Today's revenue ${U.money(m.revenue)} across ${m.count} orders; cash variance ${m.variance==null?'not reconciled':(m.variance>=0?'+':'')+U.money(m.variance)}; tomorrow 8 bookings.`;
    c.innerHTML = `
      <div class="section-head"><div><h2>Daily smart report</h2><p>Auto-pushed at close — the whole picture without logging in</p></div>
        <button class="btn btn-ghost btn-sm" id="expOrders">⬇️ Export orders (CSV)</button></div>
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
    U.qs('#expOrders',c).onclick=async()=>{
      const today=U.todayISO();
      const orders=(await MKR.db.getAll('orders')).filter(o=>new Date(o.createdAt).toISOString().slice(0,10)===today).sort((a,b)=>a.createdAt-b.createdAt);
      if(!orders.length){ U.toast('No orders today to export','amber'); return; }
      const rows=[['Order','Time','Server','Table','Items','Method','Member','Discount','Coupon','Points used','Total']];
      orders.forEach(o=>rows.push([
        '#'+o.id.slice(-6), U.fmtDateTime(o.createdAt), o.server||'', o.table||'',
        (o.items||[]).map(l=>`${l.qty}x ${l.nm}`).join('; '),
        o.method||'', o.memberName||'', o.discountPct?o.discountPct+'%':'',
        o.couponCode||'', o.pointsRedeemed||0, (Number(o.total)||0).toFixed(2)
      ]));
      U.downloadCSV(`orders-${today}.csv`, rows);
      U.toast('Orders exported','green');
    };
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
      <div class="card" style="padding:14px 18px;margin-bottom:14px"><input class="input" id="auditSearch" placeholder="Search actions, people, details…"></div>
      <div class="card" style="padding:8px 18px"><div class="list" id="auditList"></div></div>
      <div class="disclaimer mt16"><span>🔒</span>The audit log is append-only — there is no delete or edit path anywhere in the system.</div>`;
    function iconOf(a){ return ({'order.refund':'↩️','order.discount':'🏷️','order.cancel':'✖️','order.create':'🧾','pay.blinddrop':'🥁','staff.offboard':'🔒','staff.hire':'➕','tfn.view':'🪪','login':'🔑','shift.create':'📅','shift.remove':'🗑️','sos.post':'🆘','labor.approve':'✅','labor.reject':'⛔','swap.approve':'🔁','menu.add':'🍔','menu.edit':'🍔','menu.remove':'🗑️','menu.soldout':'⛔','settings.update':'⚙️','kitchen.create':'🏢','kitchen.approve':'✅','booking.create':'📅','booking.update':'📖','member.create':'🪪','member.topup':'💰','member.points':'⭐','coupon.issue':'🎟️','reward':'🎁'})[a]||'•'; }
    const list=U.qs('#auditList',c);
    function draw(q){
      const ql=(q||'').trim().toLowerCase();
      const rows=logs.filter(l=>!ql || (MKR.audit.label(l.action)+' '+(l.desc||'')+' '+(l.actor||'')).toLowerCase().includes(ql));
      list.innerHTML = rows.length? rows.map(l=>`<div class="li"><div class="ava">${iconOf(l.action)}</div>
        <div class="meta"><b>${MKR.audit.label(l.action)}${l.amount!=null?' · '+U.money(l.amount):''}</b><span>${U.esc(l.desc||'')}</span></div>
        <div style="text-align:right"><div style="font-size:13px;font-weight:600">${U.esc(l.actor||'System')}</div><div class="faint" style="font-size:11.5px">${U.fmtDateTime(l.ts)}</div></div></div>`).join('')
        : `<div class="empty"><div class="em">🗂️</div><p>${ql?'No matching actions':'No actions recorded yet'}</p></div>`;
    }
    draw('');
    U.qs('#auditSearch',c).oninput=(e)=>draw(e.target.value);
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
      <div class="section-head"><div><h2>Labor cost approval</h2><p>Forecasts next week's revenue and labor ratio; auto-flags overruns in red</p></div>
        <div class="row gap8 wrap"><button class="btn btn-ghost btn-sm" id="expWages">⬇️ Export wages</button>
        <button class="btn btn-ghost btn-sm" id="payRatesBtn">⚙️ Pay rates</button></div></div>
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
    U.qs('#payRatesBtn',c).onclick=()=>payRatesModal(()=>labor(c));
    U.qs('#expWages',c).onclick=()=>{
      const rows=[['Staff','Employment','Day','Shift','Hours','Pay (indicative)']];
      let any=false;
      shifts.slice().sort((a,b)=>String(a.day).localeCompare(String(b.day))).forEach(s=>{
        const st=staffOf(s.staffId); const p=MKR.pay.shiftPay(st,s,MKR.seed.dayTs(s.day));
        rows.push([st.name||'?', st.employment||'', s.day||'', `${s.start||''}-${s.end||''}`, (p.hours!=null?p.hours:'' ), (Number(p.pay)||0).toFixed(2)]);
        any=true;
      });
      if(!any){ U.toast('No rostered shifts to export','amber'); return; }
      rows.push(['','','','','Total', (Number(wage)||0).toFixed(2)]);
      U.downloadCSV(`wages-${U.todayISO()}.csv`, rows);
      U.toast('Wages exported','green');
    };
  }

  // ---------- Owner-configurable pay rates (award multipliers + junior tiers) ----------
  async function payRatesModal(after){
    const s = await MKR.db.meta('settings') || {};
    const d = MKR.pay.rates().day, j = MKR.pay.rates().junior;
    const pctRow=(id,label,val)=>`<div class="row center" style="gap:10px;margin-bottom:8px">
      <div class="grow" style="font-size:14px">${label}</div>
      <div class="row center" style="gap:4px"><input class="input" id="${id}" type="number" min="0" step="5" value="${Math.round(val*100)}" style="width:90px;text-align:right"><b>%</b></div></div>`;
    const wrap=U.el(`<div>
      <div class="disclaimer" style="margin-bottom:12px"><span>⚖️</span>Set the award multipliers used for indicative wage calculations across rostering, labor cost and compliance. The employer still confirms before pay runs.</div>
      <div class="section-title">Day-type rates</div>
      ${pctRow('pr_weekday','Weekday (Mon–Fri)',d.weekday)}
      ${pctRow('pr_saturday','Saturday',d.saturday)}
      ${pctRow('pr_sunday','Sunday',d.sunday)}
      ${pctRow('pr_holiday','Public holiday',d.holiday)}
      <div class="section-title mt16">Junior rates (share of adult rate by age)</div>
      ${pctRow('pr_j16','Age 16 & under',j[16])}
      ${pctRow('pr_j17','Age 17',j[17])}
      ${pctRow('pr_j18','Age 18',j[18])}
      ${pctRow('pr_j19','Age 19',j[19])}
      ${pctRow('pr_j20','Age 20',j[20])}
      <p class="faint" style="font-size:12px;margin-top:8px">Age 21+ is paid the full adult rate (100%).</p>
    </div>`);
    const num=(id)=> (Number(U.qs('#'+id,wrap).value)||0)/100;
    U.modal('Pay rate settings', wrap, {actions:[
      {label:'Save rates', class:'btn-dark', onClick:async(close)=>{
        const payRates={
          day:{ weekday:num('pr_weekday'), saturday:num('pr_saturday'), sunday:num('pr_sunday'), holiday:num('pr_holiday') },
          junior:{ 16:num('pr_j16'), 17:num('pr_j17'), 18:num('pr_j18'), 19:num('pr_j19'), 20:num('pr_j20') },
          publicHolidays: (s.payRates&&s.payRates.publicHolidays)||[],
        };
        s.payRates=payRates; await MKR.db.meta('settings', s);
        await MKR.pay.load();
        await MKR.audit.log({action:'settings.update', desc:'Updated pay rates'});
        close(); U.toast('Pay rates saved','green'); if(after) after();
      }}
    ]});
  }

  // ---------- Branches (the owner's own venues — add & switch) ----------
  async function branches(c){
    const sess=MKR.auth.current();
    const all=await MKR.db.getAll('kitchens');
    const users=await MKR.db.getAll('users');
    const orders=await MKR.db.getAll('orders');
    const mine=all.filter(k=>k.ownerId===sess.id || k.id===sess.kitchenId);
    const I=(n)=> MKR.ui?MKR.ui.icon(n):'';
    function draw(){
      const paid=orders.filter(o=>o.paid && o.status!=='cancelled' && o.status!=='refunded');
      const bstat=k=>{ const os=paid.filter(o=>(o.kitchenId||'k_main')===k.id && isToday(o.createdAt));
        return { rev:os.reduce((s,o)=>s+o.total,0), ord:os.length,
                 people:users.filter(u=>(u.kitchenId||'k_main')===k.id && u.role!=='owner' && !u.offboarded).length }; };
      const rows=mine.map(k=>({k, ...bstat(k)}));
      const totRev=rows.reduce((s,r)=>s+r.rev,0), totOrd=rows.reduce((s,r)=>s+r.ord,0), totPpl=rows.reduce((s,r)=>s+r.people,0);
      const maxRev=Math.max(1,...rows.map(r=>r.rev));
      const ranked=rows.slice().sort((a,b)=>b.rev-a.rev);
      const top=ranked[0];
      const tile=(ic,label,val)=>`<div class="card ds-tile"><div class="ds-ico">${I(ic)}</div><div class="ds-tile-body"><span class="ds-tile-label">${label}</span><span class="ds-tile-val">${val}</span></div></div>`;
      c.innerHTML=`
        <div class="section-head"><div><h2>Branches</h2><p>All your venues at a glance — compare today's performance, then switch in to manage one</p></div>
          <button class="btn btn-accent btn-sm" id="addBranch">＋ Add branch</button></div>
        <div class="grid g4" style="margin-bottom:16px">
          ${tile('building','Branches', rows.length)}
          ${tile('grid','Revenue today (all)', U.money0(totRev))}
          ${tile('receipt','Orders today (all)', totOrd)}
          ${tile('users','People (all)', totPpl)}
        </div>
        <div class="card pad20" style="margin-bottom:16px">
          <div class="section-title">${I('bars')} Revenue today by branch</div>
          <div class="bestlist">${rows.length? ranked.map(r=>`
            <div class="bestrow"><span class="bestnm">${U.esc(r.k.name)}</span><div class="besttrack"><div class="bestfill" data-w="${Math.round(r.rev/maxRev*100)}"></div></div><b class="bestq">${U.money0(r.rev)}</b></div>`).join('')
            : '<div class="empty" style="padding:16px"><div class="em">🏢</div><p>No branches yet</p></div>'}</div>
        </div>
        <div class="card" style="padding:8px 18px"><div class="list" id="blist"></div></div>
        <div class="disclaimer mt16"><span>🏢</span>Switching a branch changes which venue's team, menu and settings you manage. The current branch is highlighted and its logo/name shows on the sign-in page.</div>`;
      const el=U.qs('#blist',c);
      el.innerHTML = rows.length? rows.map(({k,rev,ord,people})=>{
        const active=k.id===sess.kitchenId;
        const isTop=top && top.k.id===k.id && top.rev>0;
        const logo=k.logo?`<img src="${k.logo}" class="kit-logo">`:`<div class="ds-li-ic">${I('building')}</div>`;
        return `<div class="li">${logo}
          <div class="meta"><b>${U.esc(k.name)} ${active?'<span class="pill ok">Current</span>':''} ${k.primary?'<span class="pill ghost">Primary</span>':''} ${isTop?'<span class="pill warn">Top today</span>':''}</b><span>${U.esc(k.location||'—')} · ${U.money0(rev)} today · ${ord} orders · ${people} people</span></div>
          ${active?'':`<button class="btn btn-ghost btn-sm" data-sw="${k.id}">Switch ›</button>`}</div>`;
      }).join('') : '<div class="empty"><div class="em">🏢</div><p>No branches yet</p></div>';
      requestAnimationFrame(()=> U.qsa('.bestfill',c).forEach(b=> b.style.width=b.dataset.w+'%'));
      U.qsa('[data-sw]',el).forEach(b=>b.onclick=async()=>{
        const k=mine.find(x=>x.id===b.dataset.sw);
        MKR.auth.switchKitchen(b.dataset.sw);
        await MKR.features.load();
        if(k) await MKR.db.meta('brand', {name:k.name, avatar:k.logo||null});
        U.toast('Switched to '+(k?k.name:'branch'),'green');
        location.hash='#/owner/dashboard'; MKR.router.render();
      });
      U.qs('#addBranch',c).onclick=addBranch;
    }
    function addBranch(){
      const wrap=U.el(`<div>
        <div class="field"><label>Branch name</label><input class="input" id="b_name" placeholder="e.g. My Kitchen · Sydney"></div>
        <div class="field"><label>Location</label><input class="input" id="b_loc" placeholder="e.g. Sydney, NSW"></div>
        <div class="row"><div class="field grow"><label>Opening time</label><input class="input" id="b_open" type="time" value="09:00"></div>
        <div class="field grow"><label>Closing time</label><input class="input" id="b_close" type="time" value="22:00"></div></div>
        <div class="disclaimer"><span>ℹ️</span>Adds a new venue you own. Switch to it to set up its team, menu and features.</div>
      </div>`);
      U.modal('Add a branch', wrap, {actions:[{label:'Add branch', class:'btn-dark', onClick:async(close)=>{
        const name=U.qs('#b_name',wrap).value.trim(); if(!name){ U.toast('Please enter a name','red'); return; }
        const id='k_'+Math.random().toString(36).slice(2,8);
        await MKR.db.put('kitchens',{id, name, location:U.qs('#b_loc',wrap).value.trim(), status:'active', ownerId:sess.id, primary:false, setupComplete:true, logo:null, operatingHours:{open:U.qs('#b_open',wrap).value, close:U.qs('#b_close',wrap).value}, createdAt:Date.now()});
        await MKR.audit.log({action:'kitchen.create', desc:`Added branch ${name}`});
        close(); U.toast('Branch added — switch to it to set it up','green'); branches(c);
      }}]});
    }
    draw();
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
    const sess=MKR.auth.current();
    const kid=(sess&&sess.kitchenId)||'k_main';
    const settings=await MKR.db.meta('settings');
    const all=(await MKR.db.getAll('users')).filter(u=>(u.kitchenId||'k_main')===kid && u.role!=='owner');
    const managers=all.filter(u=>u.role==='manager');
    const staff=all.filter(u=>u.role==='staff');
    const shifts=await MKR.db.getAll('shifts');
    const visaHours=id=>U.round2(shifts.filter(s=>s.staffId===id).reduce((t,s)=>t+MKR.pay.hours(s.start,s.end),0));
    const joinLink=`${location.origin}${location.pathname}#/join/${kid}`;

    const row=(u)=>{
      const h=visaHours(u.id); const near=u.visa==='student'&&h>=(settings.visaCapFortnight||48)-6;
      const roleTag = `<span class="pill ${u.role==='manager'?'info':'ghost'}">${MKR.auth.roleName(u.role)}</span>`;
      return `<a class="li clickable" href="#/owner/team/${u.id}">
        <div class="ava">${u.emoji||U.initials(u.name)}</div>
        <div class="meta"><b>${U.esc(u.name)} ${roleTag} ${u.offboarded?'<span class="pill danger">Offboarded</span>':''}</b>
          <span>ID ${U.esc(u.id)} · ${U.esc(u.position||EMP_LABEL(u.employment))} ${u.visa==='student'?`· student visa <b style="color:${near?'var(--red)':'inherit'}">${h.toFixed(2)}/${(settings.visaCapFortnight||48)}h</b>`:''} · ${u.onboarded?'onboarded':'pending'}</span></div>
        <span class="faint" style="font-size:22px;line-height:1">›</span></a>`;
    };

    c.innerHTML=`
      <div class="section-head"><div><h2>Team</h2><p>Your managers and staff · tap anyone to open their profile or change their role</p></div>
        <button class="btn btn-dark btn-sm" id="joinBtn">🔗 Manager join link</button></div>
      <div class="grid g3" style="margin-bottom:16px">
        <div class="card stat"><div class="k">📋 Managers</div><div class="v">${managers.length}</div></div>
        <div class="card stat"><div class="k">🧑‍🍳 Staff</div><div class="v">${staff.length}</div></div>
        <div class="card stat"><div class="k">👥 Total people</div><div class="v">${all.length}</div></div>
      </div>
      <div class="card" style="padding:6px 18px;margin-bottom:16px"><div class="section-title" style="padding-top:12px">📋 Managers <span class="faint" style="font-size:12px">${managers.length}</span></div>
        <div class="list">${managers.length?managers.map(row).join(''):'<div class="empty" style="padding:18px"><div class="em">📋</div><p>No managers yet — share the join link</p></div>'}</div></div>
      <div class="card" style="padding:6px 18px"><div class="section-title" style="padding-top:12px">🧑‍🍳 Staff <span class="faint" style="font-size:12px">${staff.length}</span></div>
        <div class="list">${staff.length?staff.map(row).join(''):'<div class="empty" style="padding:18px"><div class="em">🧑‍🍳</div><p>No staff yet</p></div>'}</div></div>
      <div class="disclaimer mt16"><span>🔒</span>Only the owner can reveal a TFN / passport (each reveal is audited); offboarded staff data is encrypted and retained for 7 years.</div>`;

    U.qs('#joinBtn',c).onclick=()=>{
      const wrap=U.el(`<div>
        <p class="muted" style="font-size:14px">Share this link with a manager. They open it, create their login, and instantly join <b>this restaurant</b>.</p>
        <div class="field"><label>Manager join link</label><input class="input" id="jl" value="${joinLink}" readonly onclick="this.select()"></div>
      </div>`);
      U.modal('Invite a manager', wrap, {actions:[{label:'Copy link', class:'btn-dark', onClick:(cl)=>{
        navigator.clipboard?.writeText(joinLink).then(()=>U.toast('Join link copied','green')).catch(()=>{});
        cl();
      }}]});
    };
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
      ha.innerHTML = `<button class="btn btn-ghost btn-sm" id="roleBtn">🔀 ${MKR.auth.roleName(u.role)}</button>
        <button class="btn btn-dark btn-sm" id="editBtn">✏️ Edit profile</button>
        ${u.offboarded?'<button class="btn btn-green btn-sm" id="restoreBtn">Reactivate</button>':'<button class="btn btn-danger btn-sm" id="offBtn">Offboard</button>'}`;
      U.qs('#editBtn',c).onclick=renderEdit;
      U.qs('#roleBtn',c).onclick=changeRole;
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

    function changeRole(){
      const cur=u.role;
      const opt=(r,em,lbl)=>`<button data-role="${r}" class="${cur===r?'active':''}">${em} ${lbl}</button>`;
      const wrap=U.el(`<div>
        <p class="muted" style="font-size:14px">Change ${U.esc(u.name)}'s role in this restaurant. Managers can run rostering, the menu and approvals; staff get the simple execution portal.</p>
        <div class="role-seg" id="rseg">${opt('staff','🧑‍🍳','Staff')}${opt('manager','📋','Manager')}</div>
      </div>`);
      let pick=cur;
      U.qsa('[data-role]',wrap).forEach(b=>b.onclick=()=>{ pick=b.dataset.role; U.qsa('[data-role]',wrap).forEach(x=>x.classList.toggle('active', x===b)); });
      U.modal('Change role', wrap, {actions:[{label:'Save role', class:'btn-dark', onClick:async(cl)=>{
        if(pick!==cur){
          await MKR.db.put('users',{id, role:pick});
          if(MKR.supa.client){ try{ await MKR.supa.client.from('profiles').update({role:pick}).eq('staff_id',id); }catch(e){} }
          await MKR.audit.log({action:'staff.hire', desc:`Changed ${u.name}'s role to ${MKR.auth.roleName(pick)}`});
          U.toast(`${u.name} is now ${MKR.auth.roleName(pick)}`,'green');
        }
        cl(); staffPage(c,id);
      }}]});
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
