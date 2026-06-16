/* ===== Manager Portal ===== */
window.MKR = window.MKR || {}; MKR.portals = MKR.portals || {};
(function(){
  const U = MKR.util;
  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  async function staffList(){ return (await MKR.db.getAll('users')).filter(u=>u.role==='staff' && !u.offboarded); }
  function hrs(s,e){ return MKR.pay.hours(s,e); }

  // A staff member's already-rostered hours this fortnight (for the student-visa cap)
  async function fortnightHours(staffId, exceptId){
    const shifts = await MKR.db.getAll('shifts');
    return shifts.filter(s=>s.staffId===staffId && s.id!==exceptId).reduce((t,s)=>t+hrs(s.start,s.end),0);
  }

  MKR.portals.manager = {
    home:'schedule', subtitle:'Run operations & lead the team · roster / add users / review',
    nav:[
      {id:'schedule', label:'Rostering',   em:'📅', short:'Roster', feature:'schedule'},
      {id:'hire',     label:'Add Users',   em:'➕', short:'Add',    feature:'hire'},
      {id:'menu',     label:'Menu & Items',em:'🍔', short:'Menu',   feature:'menu'},
      {id:'tasks',    label:'Tasks',       em:'✅', short:'Tasks',  feature:'tasks'},
      {id:'swaps',    label:'Swaps / SOS', em:'🔁', short:'Swaps',  feature:'swaps'},
      {id:'pos',      label:'POS',         em:'🧾', short:'POS',    feature:'pos'},
      {id:'kds',      label:'Kitchen',     em:'📺', short:'Kitchen',feature:'kds'},
      {id:'qr',       label:'Table QR',    em:'📱', short:'QR',     feature:'qrorder'},
    ],
    async badges(){
      const swaps = (await MKR.db.getAll('swaps')).filter(s=>s.status==='pending').length;
      return swaps?{swaps}:{};
    },
    async view(section, c){
      if(section==='pos') return MKR.views.pos.render(c);
      if(section==='kds') return MKR.views.kds.render(c);
      if(section==='qr') return qrcodes(c);
      if(section==='schedule') return schedule(c);
      if(section==='hire') return hire(c);
      if(section==='menu') return menuManager(c);
      if(section==='tasks') return tasks(c);
      if(section==='swaps') return swaps(c);
    }
  };

  // ---------- Menu & Items management ----------
  async function menuManager(c){
    let menu = await MKR.db.getAll('menu');
    const settings = await MKR.db.meta('settings') || {};
    function draw(){
      const cats = [...new Set(menu.map(m=>m.cat||'Other'))];
      c.innerHTML = `
        <div class="section-head"><div><h2>Menu &amp; Items</h2><p>Add new dishes and upload product images — changes show instantly on POS and table ordering</p></div>
          <button class="btn btn-accent btn-sm" id="addItem">＋ Add dish</button></div>
        <div class="grid g3" style="margin-bottom:16px">
          <div class="card stat"><div class="k">🍽️ Total dishes</div><div class="v">${menu.length}</div></div>
          <div class="card stat"><div class="k">🗂️ Categories</div><div class="v">${cats.length}</div></div>
          <div class="card stat"><div class="k">📷 With photo</div><div class="v">${menu.filter(m=>m.img).length}</div></div>
        </div>
        <div class="menu-admin-grid" id="mgrid"></div>`;
      const grid = U.qs('#mgrid',c);
      if(!menu.length){ grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="em">🍔</div><p>No dishes yet — tap “Add dish” to create your first item</p></div>`; }
      else grid.innerHTML = menu.slice().sort((a,b)=>(a.cat||'').localeCompare(b.cat||'')).map(m=>`
        <div class="card menu-admin-card">
          <div class="ma-thumb">${m.img?`<img src="${m.img}" alt="${U.esc(m.nm)}">`:'<span class="ma-noimg">🍽️</span>'}</div>
          <div class="ma-body">
            <b>${U.esc(m.nm)}</b>
            <div class="faint" style="font-size:12px">${U.esc(m.cat||'Other')} · ${U.money(m.price)}</div>
            <div class="row gap6 mt8">
              <button class="btn btn-ghost btn-sm grow" data-edit="${m.id}">Edit</button>
              <button class="btn btn-ghost btn-sm" data-del="${m.id}">🗑️</button>
            </div>
          </div>
        </div>`).join('');
      U.qs('#addItem',c).onclick=()=>itemModal(null);
      U.qsa('[data-edit]',grid).forEach(b=>b.onclick=()=>itemModal(menu.find(m=>m.id===b.dataset.edit)));
      U.qsa('[data-del]',grid).forEach(b=>b.onclick=async()=>{
        const m = menu.find(x=>x.id===b.dataset.del);
        if(await U.confirm('Remove dish',`Remove “${m.nm}” from the menu?`,{ok:'Remove',danger:true})){
          await MKR.db.remove('menu', m.id);
          await MKR.audit.log({action:'menu.remove', desc:`Removed menu item ${m.nm}`});
          menu = await MKR.db.getAll('menu'); draw(); U.toast('Dish removed','amber');
        }
      });
    }
    function itemModal(item){
      const isEdit = !!item;
      const roles = settings.customRoles || [];
      const cats = ['Mains','Snacks','Drinks','Desserts','Sides','Other'];
      let imgData = item ? (item.img||null) : null;
      const wrap = U.el(`<div>
        <div class="field"><label>Dish name</label><input class="input" id="i_nm" value="${item?U.esc(item.nm):''}" placeholder="e.g. Signature Beef Pho"></div>
        <div class="row">
          <div class="field grow"><label>Category</label><select class="input" id="i_cat">${cats.map(x=>`<option ${item&&item.cat===x?'selected':''}>${x}</option>`).join('')}</select></div>
          <div class="field grow"><label>Price (AUD)</label><input class="input" id="i_price" type="number" step="0.5" min="0" value="${item?item.price:''}" placeholder="0.00"></div>
        </div>
        <div class="field"><label>Product image</label>
          <label class="img-drop" id="i_drop">
            <div class="img-preview" id="i_prev">${imgData?`<img src="${imgData}">`:'<span>📷 Tap to upload a photo</span>'}</div>
            <input type="file" id="i_file" accept="image/*" hidden>
          </label>
        </div>
      </div>`);
      U.qs('#i_file',wrap).onchange=(e)=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ imgData=r.result; U.qs('#i_prev',wrap).innerHTML=`<img src="${imgData}">`; }; r.readAsDataURL(f); };
      U.modal(isEdit?'Edit dish':'Add new dish', wrap, {actions:[
        {label:isEdit?'Save changes':'Add to menu', class:'btn-dark', onClick:async(close)=>{
          const nm = U.qs('#i_nm',wrap).value.trim();
          const price = +U.qs('#i_price',wrap).value;
          if(!nm){ U.toast('Please enter a dish name','red'); return; }
          if(!(price>=0)){ U.toast('Please enter a valid price','red'); return; }
          const rec = { cat:U.qs('#i_cat',wrap).value, nm, price, img:imgData, kitchenId:(MKR.auth.current()&&MKR.auth.current().kitchenId)||'k_main' };
          if(isEdit) rec.id = item.id;
          const saved = await MKR.db.put('menu', rec);
          await MKR.audit.log({action:isEdit?'menu.edit':'menu.add', desc:`${isEdit?'Updated':'Added'} menu item ${nm}`});
          menu = await MKR.db.getAll('menu'); close(); draw();
          U.toast(isEdit?'Dish updated':'Dish added','green');
        }}
      ]});
    }
    draw();
    MKR.db.on('menu', async()=>{ menu = await MKR.db.getAll('menu'); draw(); });
  }

  // ---------- Rostering ----------
  async function schedule(c){
    // Roster pool: staff AND managers (managers can be rostered too).
    const staff = (await MKR.db.getAll('users')).filter(u=>(u.role==='staff'||u.role==='manager') && !u.offboarded);
    const settings = await MKR.db.meta('settings');
    const oh = settings.operatingHours || {open:'09:00', close:'22:00'};
    const slots = settings.shiftSlots || [{label:'Morning',start:'09:00',end:'15:00',k:'am'},{label:'Evening',start:'15:00',end:'22:00',k:'pm'}];
    const roleShifts = settings.roleShifts || {};
    let shifts = await MKR.db.getAll('shifts');

    function staffOf(id){ return staff.find(s=>s.id===id) || {name:'?',baseRate:0,employment:'casual'}; }
    function weekWage(){
      return shifts.reduce((t,s)=>{ const st=staffOf(s.staffId); return t+MKR.pay.shiftPay(st,s,MKR.seed.dayTs(s.day)).pay; },0);
    }
    function staffHours(id){ return U.round2(shifts.filter(s=>s.staffId===id).reduce((t,s)=>t+hrs(s.start,s.end),0)); }

    function draw(){
      const cells = DAYS.map((d,di)=>{
        const ds = shifts.filter(s=>s.day===di);
        const wknd = di>=5?'wknd':'';
        const today = new Date().toISOString().slice(0,10);
        const chips = ds.map(s=>{ const st=staffOf(s.staffId);
          const cls = st.visa==='student'?'b':'a';
          const reminded = s.remindedAt && new Date(s.remindedAt).toISOString().slice(0,10)===today;
          return `<span class="shift-chip ${cls}" draggable="true" data-id="${s.id}">${U.esc(st.name)} ${s.start}${reminded?' <span title="Shift reminder delivered">🔔</span>':''}<span class="rm" data-rm="${s.id}">×</span></span>`; }).join('');
        return `<div class="cell ${wknd}" data-day="${di}"><div class="d"><span>${d}</span><span>${MKR.util.fmtDate(MKR.seed.dayTs(di))}</span></div>${chips}<div class="faint" style="font-size:10px;margin-top:4px">+ shift</div></div>`;
      }).join('');
      const wage = weekWage();
      const fc = settings.revenueForecast||1;
      const pct = wage/fc;
      const over = pct > (settings.laborPctThreshold||0.28);

      c.innerHTML = `
        <div class="section-head"><div><h2>Smart rostering</h2><p>Auto-roster from availability · drag to adjust · student-visa hours hard-capped</p></div>
          <div class="row gap8 wrap">
            <button class="btn btn-ghost btn-sm" id="cfgBtn">⚙️ Shift settings</button>
            <button class="btn btn-accent btn-sm" id="autoBtn">⚡ Auto-roster</button>
          </div></div>
        <div class="grid g4 mt8" style="margin-bottom:18px">
          <div class="card stat clickable" data-stat="staff"><div class="k">👥 Total staff</div><div class="v">${staff.length}</div><div class="delta flat">on the roster · view ›</div></div>
          <div class="card stat clickable" data-stat="wage"><div class="k">💰 This week's wages</div><div class="v">${U.money0(wage)}</div><div class="delta flat">indicative · breakdown ›</div></div>
          <div class="card stat clickable" data-stat="pct"><div class="k">📊 % of forecast revenue</div><div class="v" style="color:${over?'var(--red)':'inherit'}">${U.round2(pct*100).toFixed(2)}<small>%</small></div><div class="bar"><i style="width:${Math.min(100,pct*100*2)}%;background:${over?'var(--red)':'var(--accent)'}"></i></div></div>
          <div class="card stat clickable" data-stat="visa"><div class="k">🛂 Student-visa hours (/${settings.visaCapFortnight}h)</div><div class="v" style="font-size:20px" id="visaSummary"></div></div>
        </div>
        <div class="alert info" style="margin-bottom:16px"><span>🕘</span><div>Operating hours <b>${oh.open} – ${oh.close}</b> · shift slots: ${slots.map(s=>`<b>${s.label} ${s.start}-${s.end}</b>`).join(' · ')}${Object.keys(roleShifts).length?` · fixed-hours roles: ${Object.entries(roleShifts).filter(([,v])=>v.fixed).map(([r,v])=>`<b>${U.esc(r)} ${v.start}-${v.end}</b>`).join(' · ')||'—'}`:''}</div></div>
        ${over?`<div class="alert red" style="margin-bottom:16px"><span>⚠️</span><div><b>Labor cost warning</b> · ${U.round2(pct*100).toFixed(2)}% is over the ${U.round2((settings.laborPctThreshold||0.28)*100).toFixed(2)}% red line — synced to the owner for approval.</div></div>`:''}
        <div class="card" style="padding:16px;margin-bottom:16px">
          <div class="roster">${DAYS.map(d=>`<div class="hd">${d}</div>`).join('')}${cells}</div>
        </div>
        <div class="card" style="padding:8px 18px;margin-bottom:16px">
          <div class="section-title" style="padding-top:12px">Everyone's weekly hours</div>
          <div class="list" id="ovList"></div>
        </div>
        <div class="alert green"><span>✅</span><div><b>Award pay auto-calculated</b> · split by age + employment type across weekday / Saturday / Sunday / public holiday. <b>Indicative — the employer confirms before pay runs.</b></div></div>`;

      // Student-visa summary
      const stu = staff.filter(s=>s.visa==='student');
      const sum = stu.map(s=>{ const h=staffHours(s.id);
        const near=h>=settings.visaCapFortnight-6;
        return `<div style="font-size:12.5px;margin-top:2px;color:${near?'var(--red)':'var(--ink)'}">${U.esc(s.name)} ${h.toFixed(2)}/${settings.visaCapFortnight}h</div>`; }).join('');
      U.qs('#visaSummary',c).innerHTML = sum || '—';

      // Everyone's weekly hours overview (rounded to 2 decimals)
      const ov = U.qs('#ovList',c);
      ov.innerHTML = staff.length ? staff.map(s=>{
        const cnt = shifts.filter(x=>x.staffId===s.id).length;
        const h = staffHours(s.id);
        return `<div class="li"><div class="ava">${s.emoji||U.initials(s.name)}</div>
          <div class="meta"><b>${U.esc(s.name)}</b><span>${U.esc(s.position||'—')} · ${cnt} shift${cnt===1?'':'s'}</span></div>
          <span class="pill ghost">${U.hrs(h)}</span></div>`;
      }).join('') : '<div class="empty"><div class="em">👥</div><p>No staff yet</p></div>';

      // Drag to reschedule
      let dragId=null;
      U.qsa('.shift-chip',c).forEach(ch=>{
        ch.addEventListener('dragstart',e=>{ dragId=ch.dataset.id; e.dataTransfer.effectAllowed='move'; ch.style.opacity='.35'; });
        ch.addEventListener('dragend',()=>{ ch.style.opacity=''; });
      });
      U.qsa('.roster .cell',c).forEach(cell=>{
        cell.addEventListener('dragover',e=>{ e.preventDefault(); cell.style.borderColor='var(--accent)'; });
        cell.addEventListener('dragleave',()=>{ cell.style.borderColor=''; });
        cell.addEventListener('drop',async e=>{ e.preventDefault(); cell.style.borderColor='';
          if(!dragId) return; const newDay=+cell.dataset.day; const sh=shifts.find(x=>x.id===dragId);
          if(sh && sh.day!==newDay){
            await MKR.db.put('shifts',{id:dragId, day:newDay});
            await MKR.audit.log({action:'shift.create', desc:`Moved ${staffOf(sh.staffId).name} → ${DAYS[newDay]}`});
            shifts = await MKR.db.getAll('shifts'); draw();
          }
          dragId=null;
        });
        cell.onclick=(e)=>{ if(e.target.closest('.shift-chip')||e.target.dataset.rm) return; addShift(+cell.dataset.day); };
      });
      U.qsa('[data-rm]',c).forEach(b=> b.onclick=async(e)=>{ e.stopPropagation();
        await MKR.db.remove('shifts', b.dataset.rm); await MKR.audit.log({action:'shift.remove', desc:'Removed shift'});
        shifts = await MKR.db.getAll('shifts'); draw(); });
      const ab=U.qs('#autoBtn',c); if(ab) ab.onclick=autoSchedule;
      const cb=U.qs('#cfgBtn',c); if(cb) cb.onclick=shiftSettings;
      // Drill-in: each stat card opens a detail view
      U.qsa('[data-stat]',c).forEach(card=> card.onclick=()=>statDetail(card.dataset.stat));
    }

    // Detail modals for the rostering stat cards
    function statDetail(kind){
      const cap=settings.visaCapFortnight;
      if(kind==='staff'){
        const rows = staff.length ? staff.map(s=>{
          const cnt=shifts.filter(x=>x.staffId===s.id).length;
          return `<div class="li"><div class="ava">${s.emoji||U.initials(s.name)}</div>
            <div class="meta"><b>${U.esc(s.name)}</b><span>${U.esc(s.position||'—')} · ${({casual:'Casual',parttime:'Part-time',fulltime:'Full-time'})[s.employment]||'—'}${s.visa==='student'?' · student visa':''}</span></div>
            <span class="pill ghost">${cnt} shift${cnt===1?'':'s'} · ${U.hrs(staffHours(s.id))}</span></div>`;
        }).join('') : '<div class="empty"><div class="em">👥</div><p>No staff yet</p></div>';
        U.modal('Total staff · '+staff.length, `<div class="list">${rows}</div>`);
      }
      else if(kind==='wage'){
        let total=0;
        const rows = staff.map(s=>{
          const ss=shifts.filter(x=>x.staffId===s.id);
          const pay=ss.reduce((t,x)=>t+MKR.pay.shiftPay(s,x,MKR.seed.dayTs(x.day)).pay,0); total+=pay;
          if(!ss.length) return '';
          return `<div class="li"><div class="ava">${s.emoji||U.initials(s.name)}</div>
            <div class="meta"><b>${U.esc(s.name)}</b><span>${ss.length} shift${ss.length===1?'':'s'} · ${U.hrs(staffHours(s.id))}</span></div>
            <b>${U.money(pay)}</b></div>`;
        }).join('');
        U.modal('This week\'s wages', `<div class="list">${rows||'<div class="empty"><div class="em">💰</div><p>No shifts rostered</p></div>'}</div>
          <div class="cart-total mt8"><span>Total (indicative)</span><span class="v">${U.money(total)}</span></div>
          <div class="disclaimer mt12"><span>⚖️</span>Award-based indicative figures; the employer confirms before pay runs.</div>`);
      }
      else if(kind==='pct'){
        const wage=weekWage(); const fc=settings.revenueForecast||1; const p=wage/fc;
        const over=p>(settings.laborPctThreshold||0.28);
        U.modal('Labor cost ratio', `
          <div class="list">
            <div class="li"><div class="meta"><span>Rostered wages (this week)</span><b>${U.money(wage)}</b></div></div>
            <div class="li"><div class="meta"><span>Forecast revenue</span><b>${U.money0(fc)}</b></div></div>
            <div class="li"><div class="meta"><span>Labor ratio</span><b style="color:${over?'var(--red)':'var(--green)'}">${U.round2(p*100).toFixed(2)}%</b></div></div>
            <div class="li"><div class="meta"><span>Red line</span><b>${U.round2((settings.laborPctThreshold||0.28)*100).toFixed(2)}%</b></div></div>
          </div>
          <div class="alert ${over?'red':'green'} mt12"><span>${over?'⚠️':'✅'}</span><div>${over?'Over the red line — synced to the owner for approval.':'Within the healthy range.'}</div></div>`);
      }
      else if(kind==='visa'){
        const stu=staff.filter(s=>s.visa==='student');
        const rows = stu.length ? stu.map(s=>{ const h=staffHours(s.id); const near=h>=cap-6; const over=h>cap;
          return `<div class="li"><div class="ava">${U.initials(s.name)}</div>
            <div class="meta"><b>${U.esc(s.name)}</b><span>Student visa · fortnight cap ${cap}h</span></div>
            <span class="pill ${over?'danger':near?'warn':'ok'}">${h.toFixed(2)}/${cap}h</span></div>`;
        }).join('') : '<div class="empty"><div class="em">🛂</div><p>No student-visa staff</p></div>';
        U.modal('Student-visa hours', `<div class="list">${rows}</div>
          <div class="disclaimer mt12"><span>🛂</span>Student-visa hours are hard-capped at ${cap}h/fortnight to protect employer compliance.</div>`);
      }
    }

    // Configure operating hours, flexible shift slots, custom roles, role-based fixed hours
    function shiftSettings(){
      const roles = settings.customRoles || [];
      const wrap = U.el(`<div>
        <div class="section-title">Operating hours</div>
        <div class="row">
          <div class="field grow"><label>Opening time</label><input class="input" id="oh_open" type="time" value="${oh.open}"></div>
          <div class="field grow"><label>Closing time</label><input class="input" id="oh_close" type="time" value="${oh.close}"></div>
        </div>
        <div class="section-title mt8">Shift slots (flexible)</div>
        <div id="slotList"></div>
        <button class="btn btn-ghost btn-sm" id="addSlot">＋ Add slot</button>
        <div class="section-title mt16">Roles / departments</div>
        <div class="field"><label>Custom roles (comma separated)</label><input class="input" id="roleInput" value="${U.esc(roles.join(', '))}"></div>
        <div class="section-title mt8">Role-based fixed shifts</div>
        <p class="muted" style="font-size:12.5px;margin-bottom:8px">Departments that run fixed hours (e.g. Kitchen) are placed at these exact times by the auto-roster.</p>
        <div id="roleFixed"></div>
        <div class="disclaimer mt12"><span>🕘</span>Shift slots feed the “Availability” options staff pick and the auto-roster.</div>
      </div>`);
      let workSlots = JSON.parse(JSON.stringify(slots));
      let workRoleShifts = JSON.parse(JSON.stringify(roleShifts));
      function drawSlots(){
        const el=U.qs('#slotList',wrap);
        el.innerHTML = workSlots.map((s,i)=>`<div class="row gap6 center" style="margin-bottom:8px">
          <input class="input" data-sl="${i}:label" value="${U.esc(s.label)}" placeholder="Label" style="flex:1.2">
          <input class="input" data-sl="${i}:start" type="time" value="${s.start}" style="flex:1">
          <input class="input" data-sl="${i}:end" type="time" value="${s.end}" style="flex:1">
          <button class="btn btn-ghost btn-sm" data-rmslot="${i}">×</button></div>`).join('');
        U.qsa('[data-sl]',el).forEach(inp=>inp.oninput=()=>{ const [i,f]=inp.dataset.sl.split(':'); workSlots[i][f]=inp.value; });
        U.qsa('[data-rmslot]',el).forEach(b=>b.onclick=()=>{ workSlots.splice(+b.dataset.rmslot,1); drawSlots(); });
      }
      function drawRoleFixed(){
        const el=U.qs('#roleFixed',wrap);
        const rs = (U.qs('#roleInput',wrap).value||'').split(',').map(x=>x.trim()).filter(Boolean);
        el.innerHTML = rs.map(r=>{ const rf=workRoleShifts[r]||{}; return `<div class="row gap6 center" style="margin-bottom:8px">
          <label class="row center gap6" style="flex:1.2;font-size:13px"><input type="checkbox" data-rf="${U.esc(r)}:fixed" ${rf.fixed?'checked':''} style="width:18px;height:18px"> ${U.esc(r)}</label>
          <input class="input" data-rf="${U.esc(r)}:start" type="time" value="${rf.start||oh.open}" style="flex:1">
          <input class="input" data-rf="${U.esc(r)}:end" type="time" value="${rf.end||oh.close}" style="flex:1"></div>`; }).join('') || '<p class="faint" style="font-size:12.5px">Add roles above to configure fixed hours.</p>';
        U.qsa('[data-rf]',el).forEach(inp=>{ const handler=()=>{ const [r,f]=inp.dataset.rf.split(':'); workRoleShifts[r]=workRoleShifts[r]||{}; workRoleShifts[r][f]= f==='fixed'?inp.checked:inp.value; }; inp.oninput=handler; inp.onchange=handler; });
      }
      drawSlots(); drawRoleFixed();
      U.qs('#addSlot',wrap).onclick=()=>{ workSlots.push({label:'Shift',start:oh.open,end:oh.close,k:'k'+workSlots.length}); drawSlots(); };
      U.qs('#roleInput',wrap).oninput=()=>drawRoleFixed();
      U.modal('Shift settings', wrap, {actions:[
        {label:'Save settings', class:'btn-dark', onClick:async(close)=>{
          const s = (await MKR.db.meta('settings')) || {};
          s.operatingHours = { open:U.qs('#oh_open',wrap).value, close:U.qs('#oh_close',wrap).value };
          s.shiftSlots = workSlots.map((x,i)=>({label:x.label||('Shift '+(i+1)), start:x.start, end:x.end, k:x.k||('k'+i)}));
          s.customRoles = (U.qs('#roleInput',wrap).value||'').split(',').map(x=>x.trim()).filter(Boolean);
          s.roleShifts = workRoleShifts;
          await MKR.db.meta('settings', s);
          await MKR.audit.log({action:'settings.update', desc:'Updated shift settings'});
          close(); U.toast('Shift settings saved','green'); schedule(c);
        }}
      ]});
    }

    // Auto-roster: place role-fixed-hours staff first, then fill flexible slots by
    // availability + student-visa cap, balancing load.
    async function autoSchedule(){
      if(!(await U.confirm('Auto-roster','This clears this week\'s roster and regenerates it from staff availability. Continue?',{ok:'Generate'}))) return;
      const SLOTS = slots.map(s=>({...s, h:hrs(s.start,s.end)}));
      const fits=(av,k)=> av==='all' || av===k;
      // Clear this week
      for(const s of [...shifts]) await MKR.db.remove('shifts', s.id);
      shifts=[];
      const load={}; staff.forEach(s=>load[s.id]=0);
      const fixedStaff = staff.filter(s=>{ const rf=roleShifts[s.position]; return rf && rf.fixed; });
      let placed=0, gaps=0;
      for(let day=0; day<7; day++){
        const assignedToday = new Set();
        // 1) role-based fixed shifts
        for(const s of fixedStaff){
          const av=(s.availability&&s.availability[day]);
          if(av==='off') continue;                       // explicitly off
          const rf=roleShifts[s.position]; const h=hrs(rf.start,rf.end);
          if(s.visa==='student' && (load[s.id]+h) > settings.visaCapFortnight) continue;
          await MKR.db.put('shifts',{staffId:s.id, day, start:rf.start, end:rf.end});
          load[s.id]+=h; placed++; assignedToday.add(s.id);
        }
        // 2) flexible slots
        for(const slot of SLOTS){
          const cands=staff.filter(s=>{
            if(s.role==='manager') return false;            // managers are rostered manually, not auto-assigned
            if(assignedToday.has(s.id)) return false;
            if(roleShifts[s.position] && roleShifts[s.position].fixed) return false;  // already handled above
            const av=(s.availability&&s.availability[day])||'all';
            if(!fits(av,slot.k)) return false;
            if(s.visa==='student' && (load[s.id]+slot.h) > settings.visaCapFortnight) return false;
            return true;
          }).sort((a,b)=>load[a.id]-load[b.id]);
          if(!cands.length){ gaps++; continue; }
          const pick=cands[0];
          await MKR.db.put('shifts',{staffId:pick.id, day, start:slot.start, end:slot.end});
          load[pick.id]+=slot.h; placed++; assignedToday.add(pick.id);
        }
      }
      await MKR.audit.log({action:'shift.create', desc:`Auto-roster · generated ${placed} shifts`});
      shifts=await MKR.db.getAll('shifts'); draw();
      U.toast(`Generated ${placed} shifts${gaps?` · ${gaps} slot(s) had no one available`:''}`,'green');
    }

    function addShift(day){
      const opts = staff.map(s=>`<option value="${s.id}">${U.esc(s.name)} · ${({casual:'Casual',parttime:'PT',fulltime:'FT'})[s.employment]||(s.role==='manager'?'Manager':'')}${s.position?' · '+U.esc(s.position):''}${s.visa==='student'?' · student visa':''}</option>`).join('');
      const slotPick = slots.map((s,i)=>`<option value="${i}">${U.esc(s.label)} ${s.start}-${s.end}</option>`).join('');
      const wrap = U.el(`<div>
        <div class="field"><label>Staff</label><select class="input" id="ss">${opts}</select></div>
        <div class="field"><label>Quick slot</label><select class="input" id="slot"><option value="">Custom</option>${slotPick}</select></div>
        <div class="row"><div class="field grow"><label>Start</label><input class="input" id="st" type="time" value="${slots[0]?slots[0].start:'09:00'}"></div>
        <div class="field grow"><label>End</label><input class="input" id="et" type="time" value="${slots[0]?slots[0].end:'15:00'}"></div></div>
        <div id="payPreview" class="disclaimer"></div>
      </div>`);
      function preview(){
        const st = staff.find(x=>x.id===U.qs('#ss',wrap).value);
        const p = MKR.pay.shiftPay(st, {start:U.qs('#st',wrap).value, end:U.qs('#et',wrap).value}, MKR.seed.dayTs(day));
        const jr = p.juniorPct<1 ? ` · junior rate ${Math.round(p.juniorPct*100)}% (age ${st.age})` : '';
        U.qs('#payPreview',wrap).innerHTML = `<span>💵</span><div>${p.dayLabel} rate ${U.money(p.rate)}/h × ${U.hrs(p.hours)} ≈ <b>${U.money(p.pay)}</b>${jr} (indicative, confirm before pay)</div>`;
      }
      U.qs('#slot',wrap).onchange=(e)=>{ const i=e.target.value; if(i!==''){ U.qs('#st',wrap).value=slots[i].start; U.qs('#et',wrap).value=slots[i].end; preview(); } };
      ['ss','st','et'].forEach(id=> U.qs('#'+id,wrap).addEventListener('input',preview)); preview();

      U.modal(`Add shift · ${DAYS[day]}`, wrap, {actions:[
        {label:'Save shift', class:'btn-dark', onClick:async(close)=>{
          const staffId = U.qs('#ss',wrap).value, start=U.qs('#st',wrap).value, end=U.qs('#et',wrap).value;
          const st = staff.find(x=>x.id===staffId);
          const newH = hrs(start,end);
          if(newH<=0){ U.toast('End time must be after start','red'); return; }
          // Student-visa hard cap
          if(st.visa==='student'){
            const have = await fortnightHours(staffId);
            if(have+newH > settings.visaCapFortnight){
              close();
              U.modal('🛂 Visa hours exceeded · save blocked', `
                <div class="alert red"><span>⛔</span><div><b>${U.esc(st.name)} (student visa)</b> already has ${U.hrs(have)} this fortnight; adding ${U.hrs(newH)} would reach ${U.hrs(have+newH)}, <b>over the ${settings.visaCapFortnight}h legal cap</b>.<br>To protect employer compliance, the system blocked this shift.</div></div>`,
                {actions:[{label:'Got it',class:'btn-dark',onClick:x=>x()}]});
              return;
            }
          }
          await MKR.db.put('shifts',{staffId, day, start, end});
          await MKR.audit.log({action:'shift.create', desc:`${st.name} ${DAYS[day]} ${start}-${end}`});
          shifts = await MKR.db.getAll('shifts'); close(); draw(); U.toast('Shift saved','green');
        }}
      ]});
    }
    draw();
  }

  // ---------- One-Click Add Users ----------
  async function hire(c){
    const settings = await MKR.db.meta('settings') || {};
    const roles = settings.customRoles && settings.customRoles.length ? settings.customRoles : ['Kitchen','Front of House','Cashier','Dishwasher','Head Chef'];
    const pending = (await MKR.db.getAll('users')).filter(u=>u.role==='staff' && !u.onboarded);
    c.innerHTML = `
      <div class="section-head"><div><h2>One-Click Add Users</h2><p>Enter a phone number + employment type — the system creates a compliant onboarding link to send the new starter</p></div></div>
      <div class="grid g2" style="align-items:start">
        <div class="card" style="padding:22px">
          <div class="field"><label>New starter's phone</label><input class="input" id="hphone" placeholder="04XX XXX XXX" inputmode="tel"></div>
          <div class="field"><label>Name (optional)</label><input class="input" id="hname" placeholder="leave blank to use phone"></div>
          <div class="row">
            <div class="field grow"><label>Employment type</label><select class="input" id="htype"><option value="casual">Casual</option><option value="parttime">Part-time</option><option value="fulltime">Full-time</option></select></div>
            <div class="field grow"><label>Role</label><select class="input" id="hpos">${roles.map(r=>`<option>${U.esc(r)}</option>`).join('')}</select></div>
          </div>
          <div class="field"><label>Holds a student visa?</label><select class="input" id="hvisa"><option value="none">No</option><option value="student">Yes · student visa (enable hours cap)</option></select></div>
          <button class="btn btn-accent btn-block" id="hbtn">📩 Create account &amp; send link</button>
          <div class="disclaimer mt12"><span>📋</span>The onboarding pack includes the TFN declaration, Super choice and bank details forms (Fair Work / Privacy Act).</div>
        </div>
        <div class="card" style="padding:22px">
          <div class="section-title">Pending / onboarding</div>
          <div class="list" id="plist"></div>
        </div>
      </div>`;
    function drawPending(list){
      const el = U.qs('#plist',c);
      if(!list.length){ el.innerHTML = `<div class="empty"><div class="em">👥</div><p>No new starters waiting</p></div>`; return; }
      el.innerHTML = list.map(u=>`<div class="li"><div class="ava">${U.initials(u.name)}</div>
        <div class="meta"><b>${U.esc(u.name)}</b><span>ID ${U.esc(u.id)} · ${u.position||''} · ${({casual:'Casual',parttime:'PT',fulltime:'FT'})[u.employment]} · ${u.onboarded?'Complete':'Waiting on details'}</span></div>
        <button class="btn btn-ghost btn-sm" data-link="${u.username}">Copy link</button></div>`).join('');
      U.qsa('[data-link]',el).forEach(b=>b.onclick=()=>{
        const link = `${location.origin}${location.pathname}#/staff/onboarding`;
        navigator.clipboard?.writeText(link).then(()=>U.toast('Onboarding link copied','green')).catch(()=>U.toast('Link: sign in to Staff → My onboarding'));
      });
    }
    drawPending(pending);

    U.qs('#hbtn',c).onclick = async ()=>{
      const phone = U.qs('#hphone',c).value.trim().replace(/\s/g,'');
      if(!phone){ U.toast('Please enter a phone number','red'); return; }
      const name = U.qs('#hname',c).value.trim() || ('Starter '+phone.slice(-4));
      const username = phone, password = 'mkr'+phone.slice(-4);   // default password (>=6), staff can change after first login
      const staffId = MKR.util.uid('u');
      const btn = U.qs('#hbtn',c); btn.disabled=true; btn.textContent='Creating account…';

      // 1) create the login account (secondary client, doesn't affect manager's session)
      let uid=null, authMsg='';
      if(MKR.supa.signupClient){
        const {data,error}=await MKR.supa.signupClient.auth.signUp({email:MKR.supa.emailFor(username), password});
        if(data&&data.user) uid=data.user.id;
        else if(error && /regist|exist/i.test(error.message)){ const {data:si}=await MKR.supa.signupClient.auth.signInWithPassword({email:MKR.supa.emailFor(username),password}); if(si&&si.user) uid=si.user.id; }
        else if(error) authMsg=error.message;
        await MKR.supa.signupClient.auth.signOut().catch(()=>{});
      }
      // 2) staff data + profile (role)
      const kitchenId = (MKR.auth.current()&&MKR.auth.current().kitchenId)||'k_main';
      await MKR.db.put('users',{ id:staffId, role:'staff', name, username, kitchenId,
        employment:U.qs('#htype',c).value, position:U.qs('#hpos',c).value, visa:U.qs('#hvisa',c).value,
        emoji:'🧑‍🍳', onboarded:false, age:null, baseRate:24.10, createdAt:Date.now() });
      if(uid && MKR.supa.client) await MKR.supa.client.from('profiles').upsert({id:uid, username, name, role:'staff', staff_id:staffId, emoji:'🧑‍🍳', active:true, kitchen_id:kitchenId});
      await MKR.audit.log({action:'staff.hire', desc:`Added user ${name}`});
      btn.disabled=false; btn.textContent='📩 Create account & send link';

      U.modal('✅ Staff account created', `
        ${authMsg?`<div class="alert amber"><span>⚠️</span><div>Account note: ${U.esc(authMsg)} (staff data saved — you can retry creating the login later)</div></div>`:`<div class="alert green"><span>🔑</span><div>Created an independent login for <b>${U.esc(name)}</b>.</div></div>`}
        <div class="field mt12"><label>Send these details to the new starter</label>
          <input class="input" value="Username ${U.esc(username)} · password ${U.esc(password)} · staff ID ${U.esc(staffId)}" readonly onclick="this.select()"></div>
        <p class="muted" style="font-size:13px">After signing in to the Staff portal, they complete onboarding (Passport / TFN / Super / bank) under “My profile”.</p>`,
        {actions:[{label:'Done',class:'btn-dark',onClick:x=>{x(); hire(c);}}]});
      U.qs('#hphone',c).value=''; U.qs('#hname',c).value='';
    };
  }

  // ---------- Task checklist review ----------
  async function tasks(c){
    let list = (await MKR.db.getAll('tasks')).filter(t=>t.date===U.todayISO());
    c.innerHTML = `
      <div class="section-head"><div><h2>Daily task checklist</h2><p>Publish cleaning / prep / temperature checks · review the digital logs and photos staff submit</p></div>
        <button class="btn btn-ghost btn-sm" id="addTask">+ Add task</button></div>
      <div id="tlist"></div>`;
    function draw(){
      const el = U.qs('#tlist',c);
      const done = list.filter(t=>t.done).length;
      el.innerHTML = `<div class="card stat" style="margin-bottom:16px"><div class="k">Today's progress</div>
        <div class="v">${done}<small> / ${list.length}</small></div><div class="bar"><i style="width:${list.length?done/list.length*100:0}%"></i></div></div>` +
        list.map(t=>`<div class="task-item ${t.done?'done':''}">
          <div class="task-check ${t.done?'done':''}">${t.done?'✓':''}</div>
          <div class="grow"><b>${U.esc(t.name)}</b><div class="faint" style="font-size:12px">${t.done?`${U.esc(t.by||'')} · ${t.value?U.esc(t.value)+' · ':''}submitted`:'Waiting on staff'}</div></div>
          ${t.photo?`<img class="thumb" src="${t.photo}" data-img="${t.id}">`:'<span class="pill ghost">No photo</span>'}
        </div>`).join('');
      U.qsa('[data-img]',el).forEach(im=> im.onclick=()=> U.modal('Submitted photo', `<img src="${im.src}" style="width:100%;border-radius:12px">`));
    }
    draw();
    MKR.db.on('tasks', async()=>{ list=(await MKR.db.getAll('tasks')).filter(t=>t.date===U.todayISO()); draw(); });
    U.qs('#addTask',c).onclick=()=>{
      const wrap=U.el(`<div class="field"><label>Task name</label><input class="input" id="tn" placeholder="e.g. clean the range hood"></div>`);
      U.modal('Add task',wrap,{actions:[{label:'Publish',class:'btn-dark',onClick:async(cl)=>{
        const nm=U.qs('#tn',wrap).value.trim(); if(!nm) return;
        await MKR.db.put('tasks',{name:nm, date:U.todayISO(), done:false, photo:null, by:null});
        list=(await MKR.db.getAll('tasks')).filter(t=>t.date===U.todayISO()); cl(); draw(); U.toast('Task published','green');
      }}]});
    };
  }

  // ---------- Swaps / SOS ----------
  async function swaps(c){
    const staff = await staffList();
    function nameOf(id){ const s=staff.find(x=>x.id===id); return s?s.name:'?'; }
    let sw = (await MKR.db.getAll('swaps'));
    let sos = (await MKR.db.getAll('sos')).filter(s=>s.status!=='closed');
    c.innerHTML = `
      <div class="section-head"><div><h2>Swaps / SOS dispatch</h2><p>Approve swap requests · post a rewarded urgent cover shift when it gets slammed</p></div>
        <button class="btn btn-accent btn-sm" id="sosBtn">🆘 Post SOS cover</button></div>
      <div class="grid g2" style="align-items:start">
        <div class="card" style="padding:20px"><div class="section-title">Swap requests to approve</div><div class="list" id="swlist"></div></div>
        <div class="card" style="padding:20px"><div class="section-title">Active SOS cover</div><div class="list" id="soslist"></div></div>
      </div>`;
    function drawSwaps(){
      const el=U.qs('#swlist',c); const pend=sw.filter(s=>s.status==='pending');
      if(!pend.length){ el.innerHTML=`<div class="empty"><div class="em">🔁</div><p>No swaps to approve</p></div>`; return; }
      el.innerHTML=pend.map(s=>`<div class="li"><div class="ava">${U.initials(nameOf(s.staffId))}</div>
        <div class="meta"><b>${U.esc(nameOf(s.staffId))} wants to drop a shift</b><span>${U.esc(s.label||'')} · ${U.esc(s.reason||'something came up')}</span></div>
        <div class="row gap6"><button class="btn btn-green btn-sm" data-ap="${s.id}">Approve</button><button class="btn btn-ghost btn-sm" data-rj="${s.id}">Reject</button></div></div>`).join('');
      U.qsa('[data-ap]',el).forEach(b=>b.onclick=async()=>{ await MKR.db.put('swaps',{id:b.dataset.ap,status:'approved'}); await MKR.audit.log({action:'swap.approve',desc:'Swap approved'}); sw=await MKR.db.getAll('swaps'); drawSwaps(); U.toast('Approved — posted to the swap market','green'); });
      U.qsa('[data-rj]',el).forEach(b=>b.onclick=async()=>{ await MKR.db.put('swaps',{id:b.dataset.rj,status:'rejected'}); sw=await MKR.db.getAll('swaps'); drawSwaps(); });
    }
    function drawSos(){
      const el=U.qs('#soslist',c);
      if(!sos.length){ el.innerHTML=`<div class="empty"><div class="em">📣</div><p>No active SOS</p></div>`; return; }
      el.innerHTML=sos.map(s=>`<div class="li"><div class="ava">🆘</div>
        <div class="meta"><b>${U.esc(s.title)}</b><span>Reward ${U.esc(s.reward)} · ${s.claimedBy?('claimed by '+nameOf(s.claimedBy)+' ✅'):'waiting for a taker'}</span></div>
        ${s.claimedBy?'<span class="pill ok">Covered</span>':'<span class="pill warn">Recruiting</span>'}</div>`).join('');
    }
    drawSwaps(); drawSos();
    MKR.db.on('swaps', async()=>{ sw=await MKR.db.getAll('swaps'); drawSwaps(); });
    MKR.db.on('sos', async()=>{ sos=(await MKR.db.getAll('sos')).filter(s=>s.status!=='closed'); drawSos(); });
    U.qs('#sosBtn',c).onclick=()=>{
      const wrap=U.el(`<div>
        <div class="field"><label>Time / description</label><input class="input" id="st" placeholder="e.g. tonight 18:00, short 1 person"></div>
        <div class="field"><label>Reward</label><input class="input" id="rw" value="+$40 / free meal"></div></div>`);
      U.modal('🆘 Post urgent SOS cover',wrap,{actions:[{label:'Push to available staff',class:'btn-accent',onClick:async(cl)=>{
        const title=U.qs('#st',wrap).value.trim()||'Urgent cover'; const reward=U.qs('#rw',wrap).value.trim();
        await MKR.db.put('sos',{title,reward,status:'open',claimedBy:null,ts:Date.now()});
        await MKR.audit.log({action:'sos.post',desc:'Posted SOS: '+title});
        if(MKR.notify&&MKR.notify.push) MKR.notify.push({role:'staff'}, '🆘 Urgent cover', title+' · reward '+reward, 'sos');
        sos=(await MKR.db.getAll('sos')).filter(s=>s.status!=='closed'); cl(); drawSos(); U.toast('SOS pushed to all available staff','green');
      }}]});
    };
  }

  // ---------- Table QR ordering (per-table QR codes) ----------
  async function qrcodes(c){
    const base = location.origin + location.pathname;
    const url = n => base + '#/order/' + n;
    let n = 12;
    function draw(){
      c.innerHTML=`
        <div class="section-head"><div><h2>Table QR ordering</h2><p>Stick a QR on each table — guests scan to order without signing in, straight to the kitchen</p></div>
          <div class="row gap8 center">Tables <input class="input" id="tn" type="number" min="1" max="60" value="${n}" style="width:84px;height:44px"></div></div>
        <div class="alert info" style="margin-bottom:16px"><span>📱</span><div>Guests scan to open <b>${base}#/order/table</b>; orders flow live into the kitchen KDS. Print and stick a code on every table.</div></div>
        <div class="grid g4" id="qrgrid"></div>`;
      const grid=U.qs('#qrgrid',c);
      grid.innerHTML = Array.from({length:n},(_,i)=>i+1).map(t=>`
        <div class="card" style="padding:16px;text-align:center">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(url(t))}" alt="Table ${t}" style="width:100%;max-width:170px;border-radius:12px;background:#fff"/>
          <b style="display:block;margin-top:8px">Table ${t}</b>
          <a class="faint" style="font-size:11px" href="${url(t)}" target="_blank">Preview order page ↗</a>
        </div>`).join('');
      U.qs('#tn',c).onchange=(e)=>{ n=Math.max(1,Math.min(60,+e.target.value||12)); draw(); };
    }
    draw();
  }
})();
