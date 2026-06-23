/* ===== Staff Portal ===== */
window.MKR = window.MKR || {}; MKR.portals = MKR.portals || {};
(function(){
  const U = MKR.util;
  const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  MKR.portals.staff = {
    home:'my', subtitle:'Simple execution · shifts / clock-in / claim',
    nav:[
      {id:'my',     label:'My shifts',    em:'📅', short:'Shifts'},
      {id:'availability', label:'Availability', em:'🗓️', short:'Available', feature:'availability'},
      {id:'tasks',  label:'Today\'s tasks',em:'✅', short:'Tasks', feature:'tasks'},
      {id:'market', label:'Swap market',  em:'🔁', short:'Swaps', feature:'market'},
      {id:'me',     label:'My profile',   em:'🪪', short:'Profile'},
    ],
    async badges(){
      const sos=(await MKR.db.getAll('sos')).filter(s=>s.status==='open'&&!s.claimedBy).length;
      const sess=MKR.auth.current();
      let onb=0; if(sess){ const u=await MKR.db.get('users',sess.id); if(u && !u.onboarded) onb=1; }
      const b={}; if(sos) b.market=sos; if(onb) b.me='!'; return b;
    },
    async view(section,c){
      if(section==='my') return my(c);
      if(section==='availability') return availability(c);
      if(section==='tasks') return tasks(c);
      if(section==='market') return market(c);
      if(section==='me' || section==='onboarding') return me(c);
    }
  };

  // ---------- Availability ----------
  const AVAIL_OPTS=[['off','Off','var(--red-soft)'],['am','Morning 09-15','var(--blue-soft)'],['pm','Evening 15-22','var(--accent-soft)'],['all','All day 09-22','var(--green-soft)']];
  async function availability(c){
    const sess=MKR.auth.current();
    const me=await MKR.db.get('users',sess.id)||{};
    const av=Object.assign({}, me.availability||{});   // {0..6:'off|am|pm|all'}
    c.innerHTML=`
      <div class="section-head"><div><h2>Availability</h2><p>Pick the times you can work each day — the manager's auto-roster prioritises what you fill in</p></div>
        <button class="btn btn-dark btn-sm" id="saveAv">Save</button></div>
      <div class="card" style="padding:12px 18px"><div id="avlist"></div></div>
      <div class="disclaimer mt16"><span>🗓️</span>This is just your availability — the final roster is set by your manager.</div>`;
    const el=U.qs('#avlist',c);
    function draw(){   // only redraw the list so the Save button keeps its click handler
      el.innerHTML=DAYS.map((d,i)=>{
        const cur=av[i]||'off';
        const opts=AVAIL_OPTS.map(([v,label])=>`<button class="pill ${cur===v?'ok':'ghost'}" data-set="${i}:${v}" style="cursor:pointer">${label}</button>`).join(' ');
        return `<div class="li" style="flex-wrap:wrap;gap:8px"><div class="meta" style="min-width:70px"><b>${d}</b></div><div class="row gap6 wrap">${opts}</div></div>`;
      }).join('');
      U.qsa('[data-set]',el).forEach(b=>b.onclick=()=>{ const [i,v]=b.dataset.set.split(':'); av[i]=v; draw(); });
    }
    draw();
    U.qs('#saveAv',c).onclick=async()=>{ await MKR.db.put('users',{id:sess.id, availability:av}); U.toast('Availability saved','green'); };
  }

  // ---------- My shifts ----------
  async function my(c){
    const sess = MKR.auth.current();
    const todayIdx = (new Date().getDay()+6)%7;
    let shifts = (await MKR.db.getAll('shifts')).filter(s=>s.staffId===sess.id).sort((a,b)=>a.day-b.day||a.start.localeCompare(b.start));
    let clockins = (await MKR.db.getAll('clockins')).filter(k=>k.staffId===sess.id);
    const total = U.round2(shifts.reduce((t,s)=>t+MKR.pay.hours(s.start,s.end),0));
    function draw(){
      c.innerHTML = `
        <div class="section-head"><div><h2>My shifts</h2><p>One-tap clock-in on the day · drop a shift if something comes up</p></div>
          <span class="pill ghost">${U.hrs(total)} this week</span></div>
        ${shifts.length?`<div class="alert info" style="margin-bottom:16px"><span>⏰</span><div>Next shift <b>${DAYS[shifts[0].day]} ${shifts[0].start}</b> — you'll get a reminder 1 hour before.</div></div>`:''}
        <div class="list card" style="padding:8px 18px" id="slist"></div>`;
      const el=U.qs('#slist',c);
      if(!shifts.length){ el.innerHTML=`<div class="empty"><div class="em">🌴</div><p>No shifts rostered this week</p></div>`; return; }
      el.innerHTML = shifts.map(s=>{
        const ck = clockins.find(k=>k.shiftId===s.id);
        const isToday = s.day===todayIdx;
        let right;
        if(isToday){
          right = ck ? (ck.late?`<span class="pill danger">Late ${ck.lateMins}′</span>`:`<span class="pill ok">Clocked in ${MKR.util.fmtTime(ck.clockTs)}</span>`)
                     : `<button class="btn btn-green btn-sm" data-clock="${s.id}">Clock in</button>`;
        } else right = `<button class="btn btn-ghost btn-sm" data-hang="${s.id}">Drop</button>`;
        return `<div class="li"><div class="ava">${DAYS[s.day][0]}</div>
          <div class="meta"><b>${DAYS[s.day]} · ${s.start} – ${s.end}${isToday?' · <span style="color:var(--accent)">Today</span>':''}</b><span>${MKR.util.fmtDate(MKR.seed.dayTs(s.day))} · ${U.hrs(MKR.pay.hours(s.start,s.end))}</span></div>
          ${right}</div>`;
      }).join('');
      U.qsa('[data-hang]',el).forEach(b=>b.onclick=()=>hang(shifts.find(x=>x.id===b.dataset.hang)));
      U.qsa('[data-clock]',el).forEach(b=>b.onclick=()=>clockIn(shifts.find(x=>x.id===b.dataset.clock)));
    }
    async function clockIn(shift){
      const startTs = MKR.alerts.shiftStartTs(shift);
      const lateMins = Math.max(0, Math.round((Date.now()-startTs)/60000));
      const late = lateMins>5;
      await MKR.db.put('clockins',{staffId:sess.id, shiftId:shift.id, date:U.todayISO(), scheduledTs:startTs, clockTs:Date.now(), lateMins, late});
      // Clear this shift's No-Show alert after clocking in
      const ns=(await MKR.db.getAll('alerts')).find(a=>a.key==='noshow-'+shift.id && !a.read);
      if(ns) await MKR.db.put('alerts',{id:ns.id, read:true});
      if(late){
        const myLate=(await MKR.db.getAll('clockins')).filter(k=>k.staffId===sess.id && k.late).length;
        if(myLate>=2) await MKR.alerts.raise({key:'late-consec-'+sess.id, level:'red', type:'late', title:'Staff repeatedly late', desc:`${sess.name} has been late ${myLate} times (this time ${lateMins} min) — worth a look.`});
        else await MKR.alerts.raise({key:'late-'+shift.id, level:'amber', type:'late', title:'Staff late', desc:`${sess.name} was ${lateMins} min late (${DAYS[shift.day]} ${shift.start} shift)`});
        U.toast(`Clocked in · ${lateMins} min late`,'amber');
      } else U.toast('Clocked in · on time 👍','green');
      clockins=(await MKR.db.getAll('clockins')).filter(k=>k.staffId===sess.id); draw();
    }
    function hang(shift){
      const wrap=U.el(`<div class="field"><label>Reason (optional)</label><input class="input" id="rs" placeholder="e.g. something came up"></div>`);
      U.modal('Drop to the swap market',wrap,{actions:[{label:'Confirm drop',class:'btn-dark',onClick:async(cl)=>{
        await MKR.db.put('swaps',{staffId:sess.id, shiftId:shift.id, label:`${DAYS[shift.day]} ${shift.start}-${shift.end}`, reason:U.qs('#rs',wrap).value.trim(), status:'pending', ts:Date.now()});
        cl(); U.toast('Submitted — waiting on manager approval, then it goes to the swap market','green');
      }}]});
    }
    draw();
  }

  // ---------- Today's tasks ----------
  async function tasks(c){
    const sess=MKR.auth.current();
    let list=(await MKR.db.getAll('tasks')).filter(t=>t.date===U.todayISO());
    function draw(){
      const done=list.filter(t=>t.done).length;
      c.innerHTML=`
        <div class="section-head"><div><h2>Today's task checklist</h2><p>Tick when done and upload a photo · temperature checks need a value</p></div></div>
        <div class="card stat" style="margin-bottom:16px"><div class="k">Progress</div><div class="v">${done}<small> / ${list.length}</small></div><div class="bar"><i style="width:${list.length?done/list.length*100:0}%"></i></div></div>
        <div id="tl"></div>`;
      const el=U.qs('#tl',c);
      el.innerHTML=list.map(t=>`<div class="task-item ${t.done?'done':''}">
        <div class="task-check ${t.done?'done':''}" data-tk="${t.id}">${t.done?'✓':''}</div>
        <div class="grow"><b>${U.esc(t.name)}</b><div class="faint" style="font-size:12px">${t.done?(U.esc(t.value||'')+' done ✓'):'Tap the box on the left to complete'}</div></div>
        ${t.photo?`<img class="thumb" src="${t.photo}">`:`<label class="btn btn-ghost btn-sm" style="cursor:pointer">📷 Photo<input type="file" accept="image/*" capture="environment" data-photo="${t.id}" hidden></label>`}
      </div>`).join('');
      U.qsa('[data-tk]',el).forEach(b=>b.onclick=()=>toggle(b.dataset.tk));
      U.qsa('[data-photo]',el).forEach(inp=>inp.onchange=(e)=>upload(inp.dataset.photo, e.target.files[0]));
    }
    async function toggle(id){
      const t=list.find(x=>x.id===id);
      if(/temperature/i.test(t.name) && !t.done){
        const wrap=U.el(`<div class="field"><label>Record temperature (°C)</label><input class="input" id="tp" type="number" step="0.1" placeholder="e.g. 3.5"></div>`);
        U.modal('Fridge temperature check',wrap,{actions:[{label:'Record & complete',class:'btn-dark',onClick:async(cl)=>{
          await MKR.db.put('tasks',{id, done:true, by:MKR.auth.current().name, value:U.qs('#tp',wrap).value+'°C'});
          list=(await MKR.db.getAll('tasks')).filter(x=>x.date===U.todayISO()); cl(); draw();
        }}]});
        return;
      }
      await MKR.db.put('tasks',{id, done:!t.done, by:t.done?null:MKR.auth.current().name});
      list=(await MKR.db.getAll('tasks')).filter(x=>x.date===U.todayISO()); draw();
    }
    function upload(id,file){
      if(!file) return;
      const r=new FileReader();
      r.onload=async()=>{ await MKR.db.put('tasks',{id, photo:r.result, done:true, by:MKR.auth.current().name});
        list=(await MKR.db.getAll('tasks')).filter(x=>x.date===U.todayISO()); draw(); U.toast('Photo uploaded','green'); };
      r.readAsDataURL(file);
    }
    draw();
    MKR.db.on('tasks', async()=>{ list=(await MKR.db.getAll('tasks')).filter(t=>t.date===U.todayISO()); draw(); });
  }

  // ---------- Swap market + SOS ----------
  async function market(c){
    const sess=MKR.auth.current();
    const users=await MKR.db.getAll('users');
    const nameOf=id=>{ const u=users.find(x=>x.id===id); return u?u.name:'a colleague'; };
    let swaps=(await MKR.db.getAll('swaps')).filter(s=>s.status==='approved' && s.staffId!==sess.id && !s.claimedBy);
    let sos=(await MKR.db.getAll('sos')).filter(s=>s.status==='open');
    function draw(){
      c.innerHTML=`
        <div class="section-head"><div><h2>Swap market · claim shifts</h2><p>Pick up a colleague's dropped shift · claim an urgent SOS cover in one tap</p></div></div>
        <div class="section-title">🆘 Urgent cover (with reward)</div>
        <div id="sl" class="mt8"></div>
        <div class="section-title mt24">🔁 Shifts colleagues dropped</div>
        <div class="list card" style="padding:6px 18px" id="ml"></div>`;
      const sl=U.qs('#sl',c);
      sl.innerHTML = sos.length? sos.map(s=>`<div class="alert ${s.claimedBy?'green':'amber'}" style="margin-bottom:10px"><span>🆘</span>
        <div class="grow"><b>${U.esc(s.title)}</b><br>Reward ${U.esc(s.reward)} ${s.claimedBy?'· claimed by '+nameOf(s.claimedBy):''}</div>
        ${s.claimedBy?(s.claimedBy===sess.id?'<span class="pill ok">You got it</span>':''):`<button class="btn btn-accent btn-sm" data-sos="${s.id}">Claim</button>`}</div>`).join('')
        : `<div class="empty" style="padding:20px"><div class="em">📭</div><p>No urgent cover right now</p></div>`;
      U.qsa('[data-sos]',sl).forEach(b=>b.onclick=async()=>{
        await MKR.db.put('sos',{id:b.dataset.sos, claimedBy:sess.id});
        sos=(await MKR.db.getAll('sos')).filter(s=>s.status==='open'); draw(); U.toast('Claimed! Be there on time 💪','green');
      });
      const ml=U.qs('#ml',c);
      ml.innerHTML = swaps.length? swaps.map(s=>`<div class="li"><div class="ava">${U.initials(nameOf(s.staffId))}</div>
        <div class="meta"><b>${U.esc(nameOf(s.staffId))}'s shift</b><span>${U.esc(s.label||'')} · ${U.esc(s.reason||'')}</span></div>
        <button class="btn btn-dark btn-sm" data-claim="${s.id}">Take it</button></div>`).join('')
        : `<div class="empty"><div class="em">🔁</div><p>No shifts to claim</p></div>`;
      U.qsa('[data-claim]',ml).forEach(b=>b.onclick=async()=>{
        const s=swaps.find(x=>x.id===b.dataset.claim);
        await MKR.db.put('swaps',{id:s.id, claimedBy:sess.id, status:'filled'});
        await MKR.db.put('shifts',{id:s.shiftId, staffId:sess.id});  // shift moves to me
        swaps=(await MKR.db.getAll('swaps')).filter(x=>x.status==='approved' && x.staffId!==sess.id && !x.claimedBy);
        draw(); U.toast('Taken — the shift is now on your roster','green');
      });
    }
    draw();
    MKR.db.on('sos',async()=>{ sos=(await MKR.db.getAll('sos')).filter(s=>s.status==='open'); draw(); });
    MKR.db.on('swaps',async()=>{ swaps=(await MKR.db.getAll('swaps')).filter(s=>s.status==='approved' && s.staffId!==sess.id && !s.claimedBy); draw(); });
  }

  // ---------- My profile + onboarding checklist ----------
  async function me(c){
    const sess=MKR.auth.current();
    const user=await MKR.db.get('users',sess.id) || {id:sess.id, name:sess.name};
    let ob=(await MKR.db.getAll('onboarding')).find(o=>o.userId===sess.id) || {id:'onb_'+sess.id, userId:sess.id};

    // Save a partial onboarding update and refresh the screen
    async function patchOb(patch){ ob = await MKR.db.put('onboarding', {...ob, ...patch}); }

    // Staff can see their OWN sensitive info in full (no masking for one's own data).
    let tfnPlain='', passPlain='';
    try{ if(ob.tfnEnc) tfnPlain = await MKR.crypto.dec(ob.tfnEnc, sess.id); }catch(e){}
    try{ if(ob.passportEnc) passPlain = await MKR.crypto.dec(ob.passportEnc, sess.id); }catch(e){}

    function docStatus(){
      return {
        passport: !!ob.passportDoc || !!ob.passportEnc,
        tfn:      !!ob.tfnEnc,
        super:    !!(ob.superFund || ob.superForm),
        bank:     !!(ob.bsb && ob.acct),
      };
    }

    function draw(){
      const st = docStatus();
      const required = ['passport','tfn','super'];
      const doneCount = required.filter(k=>st[k]).length;
      const allDone = doneCount===required.length;

      const item = (key, emoji, title, desc, done, btnLabel)=>`
        <div class="onb-item ${done?'done':''}">
          <div class="onb-ic">${done?'✓':emoji}</div>
          <div class="grow"><b>${title}</b><div class="faint" style="font-size:12.5px">${desc}</div></div>
          <button class="btn ${done?'btn-ghost':'btn-dark'} btn-sm" data-doc="${key}">${done?'Update':btnLabel}</button>
        </div>`;

      c.innerHTML=`
        <div class="section-head"><div><h2>My profile</h2><p>Edit your details and complete the documents your manager requires</p></div>
          <span class="pill ${user.onboarded?'ok':'warn'}">${user.onboarded?'Onboarding complete':'Onboarding in progress'}</span></div>

        ${!user.onboarded?`<div class="alert amber" style="margin-bottom:16px"><span>👋</span><div><b>Welcome aboard, ${U.esc(user.name||'')}!</b> Before your first shift, please complete the required documents below: <b>Passport</b>, <b>TFN declaration</b> and <b>Super choice</b>. ${doneCount}/${required.length} done.</div></div>`:''}

        <div class="grid g2" style="align-items:start">
          <div class="card" style="padding:20px">
            <div class="section-title">Onboarding checklist <span class="faint" style="font-size:12px">${doneCount}/${required.length} required</span></div>
            <div class="bar" style="margin:0 0 14px"><i style="width:${doneCount/required.length*100}%;background:var(--green)"></i></div>
            ${item('passport','🛂','Passport / ID', st.passport?('Passport'+(passPlain?' '+U.esc(passPlain):'')+(ob.passportDoc?' · document on file':'')):'Upload a photo of your passport or ID', st.passport, 'Upload')}
            ${item('tfn','🪪','TFN declaration', st.tfn?('Your TFN: '+U.esc(tfnPlain||'•••••••••')):'Enter your Tax File Number + declaration', st.tfn, 'Fill in')}
            ${item('super','💼','Super choice form', st.super?U.esc((ob.superFund||'Form uploaded')+(ob.superMember?' · member '+ob.superMember:'')):'Choose your super fund / upload the form', st.super, 'Fill in')}
            ${item('bank','🏦','Bank details', st.bank?U.esc((ob.bsb||'')+' / '+(ob.acct||'')):'Add your BSB + account (for pay)', st.bank, 'Add')}
            ${!user.onboarded?`<button class="btn btn-green btn-block mt16" id="finishBtn" ${allDone?'':'disabled'}>${allDone?'✅ Submit onboarding':'Complete required documents first'}</button>`:'<div class="alert green mt16"><span>✅</span><div>All set — your documents are encrypted and stored. Tap any item above to view or update.</div></div>'}
            <div class="disclaimer mt12"><span>🔒</span>Your passport / TFN are encrypted at rest (${MKR.crypto.available?'AES-GCM':'local cipher'}). You can view your own details here anytime; other staff's details are only revealable by the owner. This system aggregates data only and does not file with the ATO.</div>
          </div>

          <div class="card" style="padding:20px">
            <div class="section-title">Personal details</div>
            <div class="field"><label>Full name</label><input class="input" id="p_name" value="${U.esc(user.name||'')}"></div>
            <div class="row"><div class="field grow"><label>Phone</label><input class="input" id="p_phone" type="tel" value="${U.esc(user.phone||'')}" placeholder="04XX XXX XXX"></div>
              <div class="field grow"><label>Email</label><input class="input" id="p_email" type="email" value="${U.esc(user.email||'')}" placeholder="name@example.com"></div></div>
            <div class="field"><label>Address</label><input class="input" id="p_address" value="${U.esc(user.address||'')}"></div>
            <div class="field"><label>Emergency contact</label><input class="input" id="p_emergency" value="${U.esc(user.emergency||'')}" placeholder="name + phone"></div>
            <button class="btn btn-dark btn-block" id="saveProfile">Save profile</button>
            <div class="li mt12" style="border:none;padding:8px 0"><div class="meta"><span>Your staff ID</span><b style="font-size:15px">${U.esc(user.id)}</b></div></div>
            <a class="btn btn-ghost btn-block" href="#/staff/availability">🗓️ Set my availability</a>
          </div>
        </div>`;

      // Personal details save
      U.qs('#saveProfile',c).onclick=async()=>{
        await MKR.db.put('users',{id:sess.id, name:U.qs('#p_name',c).value.trim()||user.name,
          phone:U.qs('#p_phone',c).value.trim(), email:U.qs('#p_email',c).value.trim(),
          address:U.qs('#p_address',c).value.trim(), emergency:U.qs('#p_emergency',c).value.trim()});
        U.toast('Profile saved','green');
      };

      // Checklist item modals
      U.qsa('[data-doc]',c).forEach(b=>b.onclick=()=>docModal(b.dataset.doc));

      const fb=U.qs('#finishBtn',c);
      if(fb && allDone) fb.onclick=()=>finish();
    }

    // Reusable document-upload helper: file -> dataURL
    function fileToData(input, cb){ const f=input.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>cb(r.result); r.readAsDataURL(f); }

    function docModal(key){
      if(key==='passport'){
        let img = ob.passportDoc||null;
        const wrap=U.el(`<div>
          <div class="field"><label>Passport / ID number</label><input class="input" id="pp_no" value="${U.esc(passPlain)}" placeholder="e.g. PA1234567"></div>
          <div class="field"><label>Upload document photo</label>
            <label class="img-drop"><div class="img-preview" id="pp_prev">${img?`<img src="${img}">`:'<span>📷 Tap to upload passport / ID</span>'}</div><input type="file" id="pp_file" accept="image/*" hidden></label></div>
        </div>`);
        U.qs('#pp_file',wrap).onchange=(e)=>fileToData(e.target,(d)=>{ img=d; U.qs('#pp_prev',wrap).innerHTML=`<img src="${d}">`; });
        U.modal('🛂 Passport / ID',wrap,{actions:[{label:'Save',class:'btn-dark',onClick:async(cl)=>{
          const no=U.qs('#pp_no',wrap).value.trim();
          const patch={ passportDoc: img };
          if(no){ patch.passportEnc = await MKR.crypto.enc(no, sess.id); passPlain=no; }
          await patchOb(patch); cl(); U.toast('Passport saved','green'); draw();
        }}]});
      }
      else if(key==='tfn'){
        let form = ob.tfnForm||null;
        const wrap=U.el(`<div>
          <div class="alert info" style="margin-bottom:12px"><span>🔒</span><div>Your TFN is encrypted at rest. You can see your own here; for other staff, only the owner can reveal it (Privacy Act TFN Rule).</div></div>
          <div class="field"><label>Tax File Number (9 digits)</label><input class="input" id="tfn_no" inputmode="numeric" value="${U.esc(tfnPlain)}" placeholder="•••••••••"></div>
          <div class="field"><label>TFN declaration form (optional upload)</label>
            <label class="img-drop"><div class="img-preview" id="tfn_prev">${form?`<img src="${form}">`:'<span>📄 Tap to upload the signed form</span>'}</div><input type="file" id="tfn_file" accept="image/*" hidden></label></div>
        </div>`);
        U.qs('#tfn_file',wrap).onchange=(e)=>fileToData(e.target,(d)=>{ form=d; U.qs('#tfn_prev',wrap).innerHTML=`<img src="${d}">`; });
        U.modal('🪪 TFN declaration',wrap,{actions:[{label:'Save',class:'btn-dark',onClick:async(cl)=>{
          const tfn=U.qs('#tfn_no',wrap).value.replace(/\D/g,'');
          const patch={ tfnForm: form };
          if(tfn){ if(tfn.length<8){ U.toast('Please enter a valid TFN','red'); return; } patch.tfnEnc = await MKR.crypto.enc(tfn, sess.id); tfnPlain=tfn; }
          else if(!ob.tfnEnc){ U.toast('Please enter your TFN','red'); return; }
          await patchOb(patch); cl(); U.toast('TFN saved (encrypted)','green'); draw();
        }}]});
      }
      else if(key==='super'){
        let form = ob.superForm||null;
        const wrap=U.el(`<div>
          <div class="field"><label>Super fund name</label><input class="input" id="su_fund" value="${U.esc(ob.superFund||'')}" placeholder="e.g. AustralianSuper"></div>
          <div class="field"><label>Member number (optional)</label><input class="input" id="su_mem" value="${U.esc(ob.superMember||'')}"></div>
          <div class="field"><label>Super choice form (optional upload)</label>
            <label class="img-drop"><div class="img-preview" id="su_prev">${form?`<img src="${form}">`:'<span>📄 Tap to upload the form</span>'}</div><input type="file" id="su_file" accept="image/*" hidden></label></div>
        </div>`);
        U.qs('#su_file',wrap).onchange=(e)=>fileToData(e.target,(d)=>{ form=d; U.qs('#su_prev',wrap).innerHTML=`<img src="${d}">`; });
        U.modal('💼 Super choice',wrap,{actions:[{label:'Save',class:'btn-dark',onClick:async(cl)=>{
          const fund=U.qs('#su_fund',wrap).value.trim();
          if(!fund && !form){ U.toast('Enter a fund name or upload the form','red'); return; }
          await patchOb({ superFund:fund, superMember:U.qs('#su_mem',wrap).value.trim(), superForm:form }); cl(); U.toast('Super choice saved','green'); draw();
        }}]});
      }
      else if(key==='bank'){
        const wrap=U.el(`<div class="row">
          <div class="field grow"><label>BSB</label><input class="input" id="bk_bsb" value="${U.esc(ob.bsb||'')}" placeholder="000-000"></div>
          <div class="field grow"><label>Account number</label><input class="input" id="bk_acct" value="${U.esc(ob.acct||'')}"></div>
        </div>`);
        U.modal('🏦 Bank details',wrap,{actions:[{label:'Save',class:'btn-dark',onClick:async(cl)=>{
          await patchOb({ bsb:U.qs('#bk_bsb',wrap).value.trim(), acct:U.qs('#bk_acct',wrap).value.trim() }); cl(); U.toast('Bank details saved','green'); draw();
        }}]});
      }
    }

    function finish(){
      const wrap=U.el(`<div>
        <p class="muted" style="font-size:14px">You've completed the required documents. Confirm the information is true and submit it as your employment record (e-signature).</p>
        <label class="row center gap8" style="margin:12px 0;cursor:pointer"><input type="checkbox" id="sign" style="width:20px;height:20px"> <span style="font-size:14px">I confirm the above is true and accurate</span></label>
      </div>`);
      U.modal('Submit onboarding', wrap, {actions:[{label:'Confirm & submit',class:'btn-green',onClick:async(cl)=>{
        if(!U.qs('#sign',wrap).checked){ U.toast('Please tick the confirmation','red'); return; }
        await patchOb({ signedAt:Date.now() });
        await MKR.db.put('users',{id:sess.id, onboarded:true});
        await MKR.audit.log({action:'staff.hire', desc:`${user.name} completed onboarding`});
        cl(); U.toast('Onboarding submitted ✅','green');
        const u2=await MKR.db.get('users',sess.id); user.onboarded=u2.onboarded; draw();
      }}]});
    }

    draw();
  }
})();
