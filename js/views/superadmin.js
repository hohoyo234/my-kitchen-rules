/* ===== Super Admin Portal (hyy7010@gmail.com only) =====
   System-wide oversight: review & approve restaurant applications, full
   visibility into every venue (tenant), and switch into any owner/manager/staff
   screen of any restaurant.
*/
window.MKR = window.MKR || {}; MKR.portals = MKR.portals || {};
(function(){
  const U = MKR.util;
  const usersIn = (users,k)=> users.filter(u=>(u.kitchenId||'k_main')===k.id && u.role!=='owner'?true:(u.kitchenId||'k_main')===k.id);

  MKR.portals.superadmin = {
    home:'applications', subtitle:'System administrator — approve venues & oversee every restaurant',
    nav:[
      {id:'applications', label:'Applications', em:'📨', short:'Apps'},
      {id:'restaurants',  label:'Restaurants',  em:'🏢', short:'Venues'},
      {id:'switch',       label:'Switch view',  em:'👁', short:'Switch'},
    ],
    async badges(){ const p=(await MKR.db.getAll('kitchens')).filter(k=>k.status==='pending').length; return p?{applications:p}:{}; },
    async view(section, c, arg){
      if(section==='applications') return applications(c);
      if(section==='restaurants') return arg ? kitchenDetail(c, arg) : restaurants(c);
      if(section==='switch') return switchView(c);
    }
  };

  // ---------- Applications inbox ----------
  async function applications(c){
    let kitch = (await MKR.db.getAll('kitchens')).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const pending = kitch.filter(k=>k.status==='pending');
    const decided = kitch.filter(k=>k.status==='active'||k.status==='rejected');
    function draw(){
      c.innerHTML=`
        <div class="section-head"><div><h2>Restaurant applications</h2><p>Review and approve new restaurants before their system is provisioned</p></div>
          <span class="pill ${pending.length?'warn':'ghost'}">${pending.length} pending</span></div>
        <div class="section-title">⏳ Pending approval</div>
        <div class="card" style="padding:8px 18px;margin-bottom:18px"><div class="list" id="plist"></div></div>
        <div class="section-title">Recently decided</div>
        <div class="card" style="padding:8px 18px"><div class="list" id="dlist"></div></div>`;
      const pl=U.qs('#plist',c);
      pl.innerHTML = pending.length ? pending.map(k=>{
        const a=k.application||{};
        return `<div class="li" style="align-items:flex-start">
          <div class="ava">🏢</div>
          <div class="meta"><b>${U.esc(k.name)}</b>
            <span>${U.esc(k.location||a.address||'—')}${a.website?' · '+U.esc(a.website):''}</span>
            <span>📞 ${U.esc(k.phone||a.phone||'—')} · ✉️ ${U.esc(k.email||a.email||'—')} · 🕘 ${U.esc((k.operatingHours||a.hours||{}).open||'—')}–${U.esc((k.operatingHours||a.hours||{}).close||'—')}</span>
            <span class="faint">Owner login: ${U.esc(k.ownerUsername||'—')} · applied ${U.ago(a.submittedAt||k.createdAt||Date.now())}</span></div>
          <div class="col gap6" style="flex:0 0 auto">
            <button class="btn btn-green btn-sm" data-ap="${k.id}">✓ Approve</button>
            <button class="btn btn-ghost btn-sm" data-rj="${k.id}">Reject</button>
          </div></div>`;
      }).join('') : '<div class="empty"><div class="em">📭</div><p>No pending applications</p></div>';

      const dl=U.qs('#dlist',c);
      dl.innerHTML = decided.length ? decided.slice(0,12).map(k=>`<div class="li"><div class="ava">🏢</div>
        <div class="meta"><b>${U.esc(k.name)}</b><span>${U.esc(k.location||'—')} · ID ${U.esc(k.id)}</span></div>
        ${k.status==='active'?'<span class="pill ok">Active</span>':'<span class="pill danger">Rejected</span>'}
        <a class="btn btn-ghost btn-sm" href="#/superadmin/restaurants/${k.id}">View ›</a></div>`).join('')
        : '<div class="empty"><div class="em">—</div><p>Nothing decided yet</p></div>';

      U.qsa('[data-ap]',c).forEach(b=>b.onclick=()=>approve(b.dataset.ap));
      U.qsa('[data-rj]',c).forEach(b=>b.onclick=()=>reject(b.dataset.rj));
    }
    async function approve(id){
      const k=kitch.find(x=>x.id===id);
      await MKR.db.put('kitchens',{id, status:'active', approvedAt:Date.now()});
      // Activate the owner account so they can sign in and finish setup.
      const owner=(await MKR.db.getAll('users')).find(u=>u.role==='owner' && (u.kitchenId===id));
      if(owner) await MKR.db.put('users',{id:owner.id, status:'active'});
      if(k && k.ownerUid && MKR.supa.client){ try{ await MKR.supa.client.from('profiles').upsert({id:k.ownerUid, username:k.ownerUsername, name:k.name, role:'owner', staff_id:owner?owner.id:('u_'+k.ownerUid.slice(0,8)), emoji:'👑', active:true, kitchen_id:id}); }catch(e){} }
      // Clear the matching application alert
      const al=(await MKR.db.getAll('alerts')).find(a=>a.type==='application' && !a.read && (a.desc||'').includes(k?k.name:''));
      if(al) await MKR.db.put('alerts',{id:al.id, read:true});
      await MKR.audit.log({action:'kitchen.approve', desc:`Approved restaurant ${k?k.name:id}`});
      U.toast('Approved & provisioned — the owner can now sign in','green');
      kitch=(await MKR.db.getAll('kitchens')).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
      pending.length=0; pending.push(...kitch.filter(x=>x.status==='pending'));
      decided.length=0; decided.push(...kitch.filter(x=>x.status==='active'||x.status==='rejected'));
      draw();
    }
    async function reject(id){
      const k=kitch.find(x=>x.id===id);
      if(!(await U.confirm('Reject application', `Reject ${k?k.name:'this restaurant'}'s application?`, {ok:'Reject', danger:true}))) return;
      await MKR.db.put('kitchens',{id, status:'rejected', rejectedAt:Date.now()});
      const owner=(await MKR.db.getAll('users')).find(u=>u.role==='owner' && u.kitchenId===id);
      if(owner) await MKR.db.put('users',{id:owner.id, status:'rejected'});
      await MKR.audit.log({action:'kitchen.approve', desc:`Rejected restaurant ${k?k.name:id}`});
      U.toast('Application rejected','amber');
      kitch=(await MKR.db.getAll('kitchens')).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
      pending.length=0; pending.push(...kitch.filter(x=>x.status==='pending'));
      decided.length=0; decided.push(...kitch.filter(x=>x.status==='active'||x.status==='rejected'));
      draw();
    }
    draw();
  }

  // ---------- All restaurants (global visibility) ----------
  async function restaurants(c){
    const kitch=(await MKR.db.getAll('kitchens')).sort((a,b)=>(a.primary?-1:0)-(b.primary?-1:0));
    const users=await MKR.db.getAll('users');
    const active=kitch.filter(k=>k.status==='active').length;
    const pending=kitch.filter(k=>k.status==='pending').length;
    c.innerHTML=`
      <div class="section-head"><div><h2>All restaurants</h2><p>Global visibility across every venue (tenant), their users and configuration</p></div>
        <button class="btn btn-accent btn-sm" id="newK">＋ Create restaurant</button></div>
      <div class="grid g4" style="margin-bottom:18px">
        <div class="card stat"><div class="k">🏢 Restaurants</div><div class="v">${kitch.length}</div></div>
        <div class="card stat"><div class="k">✅ Active</div><div class="v" style="color:var(--green)">${active}</div></div>
        <div class="card stat"><div class="k">⏳ Pending</div><div class="v" style="color:${pending?'var(--amber)':'inherit'}">${pending}</div></div>
        <div class="card stat"><div class="k">👥 Total users</div><div class="v">${users.length}</div></div>
      </div>
      <div class="card" style="padding:8px 18px"><div class="list" id="klist"></div></div>
      <div class="disclaimer mt16"><span>🏢</span>Each restaurant is an isolated tenant. You have full visibility into every venue's users, data and configuration here.</div>`;
    const el=U.qs('#klist',c);
    el.innerHTML=kitch.map(k=>{
      const mem=users.filter(u=>(u.kitchenId||'k_main')===k.id);
      const mgr=mem.filter(u=>u.role==='manager').length, stf=mem.filter(u=>u.role==='staff').length;
      const badge = k.status==='active'?'<span class="pill ok">Active</span>': k.status==='pending'?'<span class="pill warn">Pending</span>':'<span class="pill danger">'+U.esc(k.status||'—')+'</span>';
      const logo = k.logo?`<img src="${k.logo}" class="kit-logo">`:'<div class="ava">🏢</div>';
      return `<div class="li">${logo}
        <div class="meta"><b>${U.esc(k.name)} ${k.primary?'<span class="pill ghost">Primary</span>':''}</b><span>${U.esc(k.location||'—')} · ${mgr} manager(s) · ${stf} staff · ID ${U.esc(k.id)}</span></div>
        <div class="row gap6 center">${badge}<a class="btn btn-ghost btn-sm" href="#/superadmin/restaurants/${k.id}">View ›</a></div></div>`;
    }).join('');
    U.qs('#newK',c).onclick=()=>{
      const wrap=U.el(`<div>
        <div class="field"><label>Restaurant / venue name</label><input class="input" id="k_name" placeholder="e.g. My Kitchen · Sydney"></div>
        <div class="field"><label>Location</label><input class="input" id="k_loc" placeholder="e.g. Sydney, NSW"></div>
        <div class="disclaimer"><span>ℹ️</span>You can create an active restaurant directly from here.</div>
      </div>`);
      U.modal('Create a restaurant', wrap, {actions:[{label:'Create (active)', class:'btn-dark', onClick:async(cl)=>{
        const name=U.qs('#k_name',wrap).value.trim(); if(!name){ U.toast('Please enter a name','red'); return; }
        const id='k_'+Math.random().toString(36).slice(2,8);
        await MKR.db.put('kitchens',{id, name, location:U.qs('#k_loc',wrap).value.trim(), status:'active', setupComplete:false, createdAt:Date.now()});
        await MKR.audit.log({action:'kitchen.create', desc:`Created restaurant ${name}`});
        cl(); U.toast('Restaurant created','green'); restaurants(c);
      }}]});
    };
  }

  async function kitchenDetail(c, id){
    const k=(await MKR.db.getAll('kitchens')).find(x=>x.id===id) || {id, name:'Restaurant', status:'active'};
    const users=(await MKR.db.getAll('users')).filter(u=>(u.kitchenId||'k_main')===id);
    const menu=(await MKR.db.getAll('menu')).filter(m=>(m.kitchenId||'k_main')===id);
    const owners=users.filter(u=>u.role==='owner'), mgrs=users.filter(u=>u.role==='manager'), staff=users.filter(u=>u.role==='staff');
    const oh=k.operatingHours||{};
    const group=(title,arr,em)=>`
      <div class="card" style="padding:6px 18px;margin-bottom:16px"><div class="section-title" style="padding-top:12px">${em} ${title} <span class="faint" style="font-size:12px">${arr.length}</span></div>
      <div class="list">${arr.length?arr.map(u=>`<div class="li"><div class="ava">${u.emoji||U.initials(u.name)}</div>
        <div class="meta"><b>${U.esc(u.name)} ${u.offboarded?'<span class="pill danger">Offboarded</span>':''}</b><span>Unique ID <b>${U.esc(u.id)}</b> · ${U.esc(u.position||MKR.auth.roleName(u.role))} · ${u.status||'active'}</span></div></div>`).join(''):'<div class="empty" style="padding:20px"><div class="em">—</div><p>None</p></div>'}</div></div>`;
    c.innerHTML=`
      <div class="row center between wrap" style="margin-bottom:16px">
        <a class="btn btn-ghost btn-sm" href="#/superadmin/restaurants">← Back to restaurants</a>
        <div class="row gap6">
          ${k.status==='pending'?`<button class="btn btn-green btn-sm" id="apK">Approve & provision</button>`:`<span class="pill ok">${U.esc(k.status||'active')}</span>`}
          <button class="btn btn-dark btn-sm" id="enterK">👁 Enter as…</button>
        </div>
      </div>
      <div class="section-head"><div><h2>${U.esc(k.name)}</h2><p>${U.esc(k.location||'—')} · tenant ID ${U.esc(k.id)}</p></div></div>
      <div class="grid g4" style="margin-bottom:18px">
        <div class="card stat"><div class="k">👑 Owners</div><div class="v">${owners.length}</div></div>
        <div class="card stat"><div class="k">📋 Managers</div><div class="v">${mgrs.length}</div></div>
        <div class="card stat"><div class="k">🧑‍🍳 Staff</div><div class="v">${staff.length}</div></div>
        <div class="card stat"><div class="k">🍽️ Menu items</div><div class="v">${menu.length}</div></div>
      </div>
      <div class="section-title">Hierarchy &amp; unique IDs</div>
      ${group('Owners',owners,'👑')}
      ${group('Managers',mgrs,'📋')}
      ${group('Staff',staff,'🧑‍🍳')}
      <div class="card" style="padding:6px 18px"><div class="section-title" style="padding-top:12px">⚙️ Configuration snapshot</div><div class="list">
        <div class="li"><div class="meta"><span>Status</span><b>${U.esc(k.status||'active')}</b></div></div>
        <div class="li"><div class="meta"><span>Operating hours</span><b>${U.esc(oh.open||'—')} – ${U.esc(oh.close||'—')}</b></div></div>
        <div class="li"><div class="meta"><span>Contact</span><b>${U.esc(k.phone||'—')} · ${U.esc(k.email||'—')}</b></div></div>
        <div class="li"><div class="meta"><span>Setup complete</span><b>${k.setupComplete?'Yes':'No'}</b></div></div>
      </div></div>
      <div class="disclaimer mt16"><span>🔑</span>Every user has a unique ID for signing into their customised portal. Use “Enter as…” to see this restaurant exactly as its owner / manager / staff do.</div>`;
    const ap=U.qs('#apK',c); if(ap) ap.onclick=async()=>{ await MKR.db.put('kitchens',{id, status:'active', approvedAt:Date.now()}); const o=owners[0]; if(o) await MKR.db.put('users',{id:o.id,status:'active'}); await MKR.audit.log({action:'kitchen.approve', desc:`Approved restaurant ${k.name}`}); U.toast('Approved','green'); kitchenDetail(c,id); };
    U.qs('#enterK',c).onclick=()=>enterAs(k);
  }

  // ---------- Switch view: enter any restaurant as any role ----------
  async function switchView(c){
    const kitch=(await MKR.db.getAll('kitchens')).filter(k=>k.status==='active');
    c.innerHTML=`
      <div class="section-head"><div><h2>Switch view</h2><p>Step into any restaurant and see exactly what its owner, manager or staff see</p></div></div>
      <div class="card" style="padding:8px 18px"><div class="list" id="sklist"></div></div>
      <div class="disclaimer mt16"><span>👁</span>A banner at the top lets you return to the Super Admin console at any time.</div>`;
    const el=U.qs('#sklist',c);
    el.innerHTML = kitch.length ? kitch.map(k=>`<div class="li">
      <div class="ava">🏢</div>
      <div class="meta"><b>${U.esc(k.name)}</b><span>${U.esc(k.location||'—')} · ID ${U.esc(k.id)}</span></div>
      <div class="row gap6">
        <button class="btn btn-ghost btn-sm" data-go="${k.id}:owner">👑 Owner</button>
        <button class="btn btn-ghost btn-sm" data-go="${k.id}:manager">📋 Manager</button>
        <button class="btn btn-ghost btn-sm" data-go="${k.id}:staff">🧑‍🍳 Staff</button>
      </div></div>`).join('') : '<div class="empty"><div class="em">🏢</div><p>No active restaurants</p></div>';
    U.qsa('[data-go]',el).forEach(b=>b.onclick=()=>{ const [kid,role]=b.dataset.go.split(':'); const k=kitch.find(x=>x.id===kid); enterAs(k, role); });
  }

  function enterAs(k, role){
    const go = (r)=>{ MKR.auth.impersonate(r, k.id, (k.name||'Restaurant')+' · '+MKR.auth.roleName(r)); location.hash = `#/${r}/${MKR.portals[r].home}`; };
    if(role) return go(role);
    const wrap=U.el(`<div class="row gap8" style="flex-wrap:wrap">
      <button class="btn btn-ghost grow" data-r="owner">👑 Owner</button>
      <button class="btn btn-ghost grow" data-r="manager">📋 Manager</button>
      <button class="btn btn-ghost grow" data-r="staff">🧑‍🍳 Staff</button></div>`);
    const m=U.modal('Enter '+(k.name||'restaurant')+' as…', wrap);
    U.qsa('[data-r]',wrap).forEach(b=>b.onclick=()=>{ m.close(); go(b.dataset.r); });
  }
})();
