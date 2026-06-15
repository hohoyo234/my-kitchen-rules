/* ===== 员工端 Staff Portal ===== */
window.MKR = window.MKR || {}; MKR.portals = MKR.portals || {};
(function(){
  const U = MKR.util;
  const DAYS=['周一','周二','周三','周四','周五','周六','周日'];

  MKR.portals.staff = {
    home:'my', subtitle:'傻瓜化执行 · 看班 / 打卡 / 抢单',
    nav:[
      {id:'my',     label:'我的班表', em:'📅', short:'班表'},
      {id:'availability', label:'可上班时间', em:'🗓️', short:'可上班', feature:'availability'},
      {id:'tasks',  label:'今日任务', em:'✅', short:'任务', feature:'tasks'},
      {id:'market', label:'换班市场', em:'🔁', short:'换班', feature:'market'},
      {id:'me',     label:'我的资料', em:'🪪', short:'资料'},
    ],
    async badges(){
      const sos=(await MKR.db.getAll('sos')).filter(s=>s.status==='open'&&!s.claimedBy).length;
      return sos?{market:sos}:{};
    },
    async view(section,c){
      if(section==='my') return my(c);
      if(section==='availability') return availability(c);
      if(section==='tasks') return tasks(c);
      if(section==='market') return market(c);
      if(section==='me') return me(c);
    }
  };

  // ---------- 可上班时间 ----------
  const AVAIL_OPTS=[['off','不可','var(--red-soft)'],['am','早班 09-15','var(--blue-soft)'],['pm','晚班 15-22','var(--accent-soft)'],['all','全天 09-22','var(--green-soft)']];
  async function availability(c){
    const sess=MKR.auth.current();
    const me=await MKR.db.get('users',sess.id)||{};
    const av=Object.assign({}, me.availability||{});   // {0..6:'off|am|pm|all'}
    function draw(){
      c.innerHTML=`
        <div class="section-head"><div><h2>可上班时间</h2><p>选好你每天能来的时段,经理"一键排班"会优先按你填的来排</p></div>
          <button class="btn btn-dark btn-sm" id="saveAv">保存</button></div>
        <div class="card" style="padding:12px 18px"><div id="avlist"></div></div>
        <div class="disclaimer mt16"><span>🗓️</span>这只是你的"可上班意向",最终班表以经理排班为准。</div>`;
      const el=U.qs('#avlist',c);
      el.innerHTML=DAYS.map((d,i)=>{
        const cur=av[i]||'off';
        const opts=AVAIL_OPTS.map(([v,label])=>`<button class="pill ${cur===v?'ok':'ghost'}" data-set="${i}:${v}" style="cursor:pointer">${label}</button>`).join(' ');
        return `<div class="li" style="flex-wrap:wrap;gap:8px"><div class="meta" style="min-width:70px"><b>${d}</b></div><div class="row gap6 wrap">${opts}</div></div>`;
      }).join('');
      U.qsa('[data-set]',el).forEach(b=>b.onclick=()=>{ const [i,v]=b.dataset.set.split(':'); av[i]=v; draw(); });
    }
    draw();
    U.qs('#saveAv',c).onclick=async()=>{ await MKR.db.put('users',{id:sess.id, availability:av}); U.toast('可上班时间已保存','green'); };
  }

  // ---------- 我的班表 ----------
  async function my(c){
    const sess = MKR.auth.current();
    const todayIdx = (new Date().getDay()+6)%7;
    let shifts = (await MKR.db.getAll('shifts')).filter(s=>s.staffId===sess.id).sort((a,b)=>a.day-b.day||a.start.localeCompare(b.start));
    let clockins = (await MKR.db.getAll('clockins')).filter(k=>k.staffId===sess.id);
    function draw(){
      c.innerHTML = `
        <div class="section-head"><div><h2>我的班表</h2><p>当天上班一键打卡 · 临时有事可一键挂班</p></div></div>
        ${shifts.length?`<div class="alert info" style="margin-bottom:16px"><span>⏰</span><div>下个班 <b>${DAYS[shifts[0].day]} ${shifts[0].start}</b> — 上班前 1 小时将自动提醒（接入推送后生效）。</div></div>`:''}
        <div class="list card" style="padding:8px 18px" id="slist"></div>`;
      const el=U.qs('#slist',c);
      if(!shifts.length){ el.innerHTML=`<div class="empty"><div class="em">🌴</div><p>本周暂无排班</p></div>`; return; }
      el.innerHTML = shifts.map(s=>{
        const ck = clockins.find(k=>k.shiftId===s.id);
        const isToday = s.day===todayIdx;
        let right;
        if(isToday){
          right = ck ? (ck.late?`<span class="pill danger">迟到 ${ck.lateMins}′</span>`:`<span class="pill ok">已打卡 ${MKR.util.fmtTime(ck.clockTs)}</span>`)
                     : `<button class="btn btn-green btn-sm" data-clock="${s.id}">打卡上班</button>`;
        } else right = `<button class="btn btn-ghost btn-sm" data-hang="${s.id}">挂班</button>`;
        return `<div class="li"><div class="ava">${DAYS[s.day][1]}</div>
          <div class="meta"><b>${DAYS[s.day]} · ${s.start} – ${s.end}${isToday?' · <span style="color:var(--accent)">今天</span>':''}</b><span>${MKR.util.fmtDate(MKR.seed.dayTs(s.day))} · ${MKR.pay.hours(s.start,s.end)} 小时</span></div>
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
      // 打卡后自动消解该班次的 No Show 风险警报
      const ns=(await MKR.db.getAll('alerts')).find(a=>a.key==='noshow-'+shift.id && !a.read);
      if(ns) await MKR.db.put('alerts',{id:ns.id, read:true});
      if(late){
        const myLate=(await MKR.db.getAll('clockins')).filter(k=>k.staffId===sess.id && k.late).length;
        if(myLate>=2) await MKR.alerts.raise({key:'late-consec-'+sess.id, level:'red', type:'late', title:'员工连续迟到', desc:`${sess.name} 已第 ${myLate} 次迟到（本次 ${lateMins} 分钟），建议关注。`});
        else await MKR.alerts.raise({key:'late-'+shift.id, level:'amber', type:'late', title:'员工迟到', desc:`${sess.name} 迟到 ${lateMins} 分钟（${DAYS[shift.day]} ${shift.start} 班）`});
        U.toast(`已打卡 · 迟到 ${lateMins} 分钟`,'amber');
      } else U.toast('打卡成功 · 准时 👍','green');
      clockins=(await MKR.db.getAll('clockins')).filter(k=>k.staffId===sess.id); draw();
    }
    function hang(shift){
      const wrap=U.el(`<div class="field"><label>挂班原因（可选）</label><input class="input" id="rs" placeholder="如 临时有事"></div>`);
      U.modal('挂到换班市场',wrap,{actions:[{label:'确认挂班',class:'btn-dark',onClick:async(cl)=>{
        await MKR.db.put('swaps',{staffId:sess.id, shiftId:shift.id, label:`${DAYS[shift.day]} ${shift.start}-${shift.end}`, reason:U.qs('#rs',wrap).value.trim(), status:'pending', ts:Date.now()});
        cl(); U.toast('已提交，等待经理审批后进入换班市场','green');
      }}]});
    }
    draw();
  }

  // ---------- 今日任务 ----------
  async function tasks(c){
    const sess=MKR.auth.current();
    let list=(await MKR.db.getAll('tasks')).filter(t=>t.date===U.todayISO());
    function draw(){
      const done=list.filter(t=>t.done).length;
      c.innerHTML=`
        <div class="section-head"><div><h2>今日任务清单</h2><p>完成后勾选并拍照上传 · 温度需填数值</p></div></div>
        <div class="card stat" style="margin-bottom:16px"><div class="k">完成进度</div><div class="v">${done}<small> / ${list.length}</small></div><div class="bar"><i style="width:${list.length?done/list.length*100:0}%"></i></div></div>
        <div id="tl"></div>`;
      const el=U.qs('#tl',c);
      el.innerHTML=list.map(t=>`<div class="task-item ${t.done?'done':''}">
        <div class="task-check ${t.done?'done':''}" data-tk="${t.id}">${t.done?'✓':''}</div>
        <div class="grow"><b>${U.esc(t.name)}</b><div class="faint" style="font-size:12px">${t.done?(U.esc(t.value||'')+' 已完成 ✓'):'点左侧方块完成'}</div></div>
        ${t.photo?`<img class="thumb" src="${t.photo}">`:`<label class="btn btn-ghost btn-sm" style="cursor:pointer">📷 拍照<input type="file" accept="image/*" capture="environment" data-photo="${t.id}" hidden></label>`}
      </div>`).join('');
      U.qsa('[data-tk]',el).forEach(b=>b.onclick=()=>toggle(b.dataset.tk));
      U.qsa('[data-photo]',el).forEach(inp=>inp.onchange=(e)=>upload(inp.dataset.photo, e.target.files[0]));
    }
    async function toggle(id){
      const t=list.find(x=>x.id===id);
      if(/温度/.test(t.name) && !t.done){
        const wrap=U.el(`<div class="field"><label>记录温度 (°C)</label><input class="input" id="tp" type="number" step="0.1" placeholder="如 3.5"></div>`);
        U.modal('冰箱温度检查',wrap,{actions:[{label:'记录并完成',class:'btn-dark',onClick:async(cl)=>{
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
        list=(await MKR.db.getAll('tasks')).filter(x=>x.date===U.todayISO()); draw(); U.toast('照片已上传','green'); };
      r.readAsDataURL(file);
    }
    draw();
    MKR.db.on('tasks', async()=>{ list=(await MKR.db.getAll('tasks')).filter(t=>t.date===U.todayISO()); draw(); });
  }

  // ---------- 换班市场 + SOS ----------
  async function market(c){
    const sess=MKR.auth.current();
    const users=await MKR.db.getAll('users');
    const nameOf=id=>{ const u=users.find(x=>x.id===id); return u?u.name:'同事'; };
    let swaps=(await MKR.db.getAll('swaps')).filter(s=>s.status==='approved' && s.staffId!==sess.id && !s.claimedBy);
    let sos=(await MKR.db.getAll('sos')).filter(s=>s.status==='open');
    function draw(){
      c.innerHTML=`
        <div class="section-head"><div><h2>换班市场 · 抢单</h2><p>认领同事挂出的班次 · 接收 SOS 紧急顶班一键抢单</p></div></div>
        <div class="section-title">🆘 紧急顶班（带奖励）</div>
        <div id="sl" class="mt8"></div>
        <div class="section-title mt24">🔁 同事挂出的班次</div>
        <div class="list card" style="padding:6px 18px" id="ml"></div>`;
      const sl=U.qs('#sl',c);
      sl.innerHTML = sos.length? sos.map(s=>`<div class="alert ${s.claimedBy?'green':'amber'}" style="margin-bottom:10px"><span>🆘</span>
        <div class="grow"><b>${U.esc(s.title)}</b><br>奖励 ${U.esc(s.reward)} ${s.claimedBy?'· 已被 '+nameOf(s.claimedBy)+' 抢走':''}</div>
        ${s.claimedBy?(s.claimedBy===sess.id?'<span class="pill ok">你已抢到</span>':''):`<button class="btn btn-accent btn-sm" data-sos="${s.id}">抢单</button>`}</div>`).join('')
        : `<div class="empty" style="padding:20px"><div class="em">📭</div><p>暂无紧急顶班</p></div>`;
      U.qsa('[data-sos]',sl).forEach(b=>b.onclick=async()=>{
        await MKR.db.put('sos',{id:b.dataset.sos, claimedBy:sess.id});
        sos=(await MKR.db.getAll('sos')).filter(s=>s.status==='open'); draw(); U.toast('抢单成功！记得准时到岗 💪','green');
      });
      const ml=U.qs('#ml',c);
      ml.innerHTML = swaps.length? swaps.map(s=>`<div class="li"><div class="ava">${U.initials(nameOf(s.staffId))}</div>
        <div class="meta"><b>${nameOf(s.staffId)} 的班次</b><span>${U.esc(s.label||'')} · ${U.esc(s.reason||'')}</span></div>
        <button class="btn btn-dark btn-sm" data-claim="${s.id}">认领</button></div>`).join('')
        : `<div class="empty"><div class="em">🔁</div><p>暂无可认领的班次</p></div>`;
      U.qsa('[data-claim]',ml).forEach(b=>b.onclick=async()=>{
        const s=swaps.find(x=>x.id===b.dataset.claim);
        await MKR.db.put('swaps',{id:s.id, claimedBy:sess.id, status:'filled'});
        await MKR.db.put('shifts',{id:s.shiftId, staffId:sess.id});  // 班次转到我名下
        swaps=(await MKR.db.getAll('swaps')).filter(x=>x.status==='approved' && x.staffId!==sess.id && !x.claimedBy);
        draw(); U.toast('已认领，班次已加入你的班表','green');
      });
    }
    draw();
    MKR.db.on('sos',async()=>{ sos=(await MKR.db.getAll('sos')).filter(s=>s.status==='open'); draw(); });
    MKR.db.on('swaps',async()=>{ swaps=(await MKR.db.getAll('swaps')).filter(s=>s.status==='approved' && s.staffId!==sess.id && !s.claimedBy); draw(); });
  }

  // ---------- 我的资料 / 自助入职 ----------
  async function me(c){
    const sess=MKR.auth.current();
    const user=await MKR.db.get('users',sess.id);
    const existing=(await MKR.db.getAll('onboarding')).find(o=>o.userId===sess.id);

    if(user.onboarded && existing){
      c.innerHTML=`
        <div class="section-head"><div><h2>我的资料</h2><p>入职信息已提交并加密存储</p></div></div>
        <div class="card" style="padding:22px;max-width:520px">
          <div class="alert green" style="margin-bottom:16px"><span>✅</span><div>入职资料已完成。<b>TFN 已单独加密存储</b>，仅老板角色可调取（Privacy Act TFN Rule）。</div></div>
          <div class="li"><div class="meta"><b>姓名</b><span>${U.esc(user.name)}</span></div></div>
          <div class="li"><div class="meta"><b>税号 TFN</b><span>${MKR.crypto.mask()}（已加密 · 你无法查看）</span></div></div>
          <div class="li"><div class="meta"><b>Super 基金</b><span>${U.esc(existing.superFund||'—')}</span></div></div>
          <div class="li"><div class="meta"><b>银行账户 BSB</b><span>${U.esc(existing.bsb||'—')} / ${U.esc(existing.acct||'—')}</span></div></div>
        </div>`;
      return;
    }

    c.innerHTML=`
      <div class="section-head"><div><h2>极简自助入职</h2><p>手机上填写 TFN / Super / 银行信息，3 分钟搞定</p></div></div>
      <div class="card" style="padding:22px;max-width:540px">
        <div class="field"><label>姓名</label><input class="input" id="o_name" value="${U.esc(user.name)}"></div>
        <div class="field"><label>税号 TFN（9 位）<span class="faint"> · 将单独加密，仅老板可调取</span></label><input class="input" id="o_tfn" inputmode="numeric" placeholder="•••••••••"></div>
        <div class="row">
          <div class="field grow"><label>Super 基金名称</label><input class="input" id="o_super" placeholder="如 AustralianSuper"></div>
        </div>
        <div class="row">
          <div class="field grow"><label>银行 BSB</label><input class="input" id="o_bsb" placeholder="000-000"></div>
          <div class="field grow"><label>账号</label><input class="input" id="o_acct" placeholder="账号"></div>
        </div>
        <div class="field"><label>上传证件 / 表格照片（可选 · 系统预审）</label>
          <label class="btn btn-ghost" style="cursor:pointer">📷 选择照片<input type="file" id="o_photo" accept="image/*" hidden></label>
          <div id="o_thumb"></div>
        </div>
        <label class="row center gap8" style="margin:6px 0 14px;cursor:pointer"><input type="checkbox" id="o_sign" style="width:20px;height:20px"> <span style="font-size:14px">我确认以上信息真实，并同意作为雇佣记录留存（电子签名）</span></label>
        <button class="btn btn-dark btn-block" id="o_submit">提交入职资料</button>
        <div class="disclaimer mt12"><span>🔒</span>TFN 通过浏览器原生加密（${MKR.crypto.available?'AES-GCM':'本地混淆'}）单独存储；本系统仅汇总数据，不直接对接 ATO，最终税务以会计师确认为准。</div>
      </div>`;

    let photoData=null;
    U.qs('#o_photo',c).onchange=(e)=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=()=>{ photoData=r.result; U.qs('#o_thumb',c).innerHTML=`<img class="thumb mt8" src="${photoData}" style="width:64px;height:64px">`; }; r.readAsDataURL(f); };

    // 草稿自动保存 + 标脏（断电恢复 / 误刷新拦截）
    ['o_name','o_tfn','o_super','o_bsb','o_acct'].forEach(id=>{
      const inp=U.qs('#'+id,c);
      inp.addEventListener('input',()=>{ MKR.net.setDirty(true); MKR.db.draft.save('onboard-'+sess.id, formData()); });
    });
    function formData(){ return {name:U.qs('#o_name',c).value,super:U.qs('#o_super',c).value,bsb:U.qs('#o_bsb',c).value,acct:U.qs('#o_acct',c).value}; }
    const d=MKR.db.draft.load('onboard-'+sess.id);
    if(d&&d.data){ U.qs('#o_name',c).value=d.data.name||user.name; U.qs('#o_super',c).value=d.data.super||''; U.qs('#o_bsb',c).value=d.data.bsb||''; U.qs('#o_acct',c).value=d.data.acct||''; }

    U.qs('#o_submit',c).onclick=async()=>{
      const tfn=U.qs('#o_tfn',c).value.replace(/\D/g,'');
      if(tfn.length<8){ U.toast('请填写有效的 TFN','red'); return; }
      if(!U.qs('#o_sign',c).checked){ U.toast('请勾选电子签名确认','red'); return; }
      const encTfn=await MKR.crypto.enc(tfn);   // 加密！
      await MKR.db.put('onboarding',{userId:sess.id, tfnEnc:encTfn, superFund:U.qs('#o_super',c).value.trim(),
        bsb:U.qs('#o_bsb',c).value.trim(), acct:U.qs('#o_acct',c).value.trim(), photo:photoData, signedAt:Date.now()});
      await MKR.db.put('users',{id:sess.id, name:U.qs('#o_name',c).value.trim(), onboarded:true});
      await MKR.audit.log({action:'staff.hire', desc:`${user.name} 完成自助入职`});
      MKR.db.draft.clear('onboard-'+sess.id); MKR.net.setDirty(false);
      U.toast('入职资料已加密提交 ✅','green');
      me(c);
    };
  }
})();
