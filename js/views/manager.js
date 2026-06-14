/* ===== 经理端 Manager Portal ===== */
window.MKR = window.MKR || {}; MKR.portals = MKR.portals || {};
(function(){
  const U = MKR.util;
  const DAYS = ['周一','周二','周三','周四','周五','周六','周日'];

  async function staffList(){ return (await MKR.db.getAll('users')).filter(u=>u.role==='staff' && !u.offboarded); }
  function hrs(s,e){ return MKR.pay.hours(s,e); }

  // 某员工本双周已排工时（学生签卡控用）：统计其全部已存班次
  async function fortnightHours(staffId, exceptId){
    const shifts = await MKR.db.getAll('shifts');
    return shifts.filter(s=>s.staffId===staffId && s.id!==exceptId).reduce((t,s)=>t+hrs(s.start,s.end),0);
  }

  MKR.portals.manager = {
    home:'schedule', subtitle:'执行业务与带团队 · 排班 / 招人 / 审核',
    nav:[
      {id:'schedule', label:'智能排班', em:'📅', short:'排班'},
      {id:'hire',     label:'一键招人', em:'➕', short:'招人'},
      {id:'tasks',    label:'任务清单', em:'✅', short:'任务'},
      {id:'swaps',    label:'换班 / SOS', em:'🔁', short:'换班'},
      {id:'pos',      label:'点餐收银', em:'🧾', short:'收银'},
      {id:'kds',      label:'后厨看板', em:'📺', short:'后厨'},
    ],
    async badges(){
      const swaps = (await MKR.db.getAll('swaps')).filter(s=>s.status==='pending').length;
      return swaps?{swaps}:{};
    },
    async view(section, c){
      if(section==='pos') return MKR.views.pos.render(c);
      if(section==='kds') return MKR.views.kds.render(c);
      if(section==='schedule') return schedule(c);
      if(section==='hire') return hire(c);
      if(section==='tasks') return tasks(c);
      if(section==='swaps') return swaps(c);
    }
  };

  // ---------- 排班 ----------
  async function schedule(c){
    const staff = await staffList();
    const settings = await MKR.db.meta('settings');
    let shifts = await MKR.db.getAll('shifts');

    function staffOf(id){ return staff.find(s=>s.id===id) || {name:'?',baseRate:0,employment:'casual'}; }
    function weekWage(){
      return shifts.reduce((t,s)=>{ const st=staffOf(s.staffId); return t+MKR.pay.shiftPay(st,s,MKR.seed.dayTs(s.day)).pay; },0);
    }
    function draw(){
      const cells = DAYS.map((d,di)=>{
        const ds = shifts.filter(s=>s.day===di);
        const wknd = di>=5?'wknd':'';
        const chips = ds.map(s=>{ const st=staffOf(s.staffId);
          const cls = st.visa==='student'?'b':'a';
          return `<span class="shift-chip ${cls}" draggable="true" data-id="${s.id}">${st.name} ${s.start}<span class="rm" data-rm="${s.id}">×</span></span>`; }).join('');
        return `<div class="cell ${wknd}" data-day="${di}"><div class="d"><span>${d}</span><span>${MKR.util.fmtDate(MKR.seed.dayTs(di))}</span></div>${chips}<div class="faint" style="font-size:10px;margin-top:4px">+ 排班</div></div>`;
      }).join('');
      const wage = weekWage();
      const fc = settings.revenueForecast||1;
      const pct = wage/fc;
      const over = pct > (settings.laborPctThreshold||0.28);

      c.innerHTML = `
        <div class="section-head"><div><h2>智能排班引擎</h2><p>拖拽即可排班 · 实时显示薪资占比 · 学生签工时硬卡控</p></div></div>
        <div class="grid g3 mt8" style="margin-bottom:18px">
          <div class="card stat"><div class="k">💰 本周排班总薪资</div><div class="v">${U.money0(wage)}</div><div class="delta flat">参考值，发薪前需确认</div></div>
          <div class="card stat"><div class="k">📊 占预估营业额</div><div class="v ${over?'':''}" style="color:${over?'var(--red)':'inherit'}">${(pct*100).toFixed(0)}<small>%</small></div><div class="bar"><i style="width:${Math.min(100,pct*100*2)}%;background:${over?'var(--red)':'var(--accent)'}"></i></div></div>
          <div class="card stat"><div class="k">🛂 学生签工时（双周/48h）</div><div class="v" style="font-size:20px" id="visaSummary"></div></div>
        </div>
        ${over?`<div class="alert red" style="margin-bottom:16px"><span>⚠️</span><div><b>人工成本预警</b> · 占比 ${(pct*100).toFixed(0)}% 已超红线 ${((settings.laborPctThreshold||0.28)*100).toFixed(0)}%，已同步老板端待审批。</div></div>`:''}
        <div class="card" style="padding:16px;margin-bottom:16px">
          <div class="roster">${DAYS.map(d=>`<div class="hd">${d}</div>`).join('')}${cells}</div>
        </div>
        <div class="alert green"><span>✅</span><div><b>法定薪资自动计算</b> · 已按年龄 + 工时类型自动切分平日/周六/周日/公众假期费率。<b>计算结果供参考，发薪前需雇主确认。</b></div></div>`;

      // 学生签工时摘要
      const stu = staff.filter(s=>s.visa==='student');
      const sum = stu.map(s=>{ const h=shifts.filter(x=>x.staffId===s.id).reduce((t,x)=>t+hrs(x.start,x.end),0);
        const near=h>=settings.visaCapFortnight-6;
        return `<div style="font-size:12.5px;margin-top:2px;color:${near?'var(--red)':'var(--ink)'}">${s.name} ${h}/${settings.visaCapFortnight}h</div>`; }).join('');
      U.qs('#visaSummary',c).innerHTML = sum || '—';

      // 拖拽调班
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
            await MKR.audit.log({action:'shift.create', desc:`拖拽调班 ${staffOf(sh.staffId).name} → ${DAYS[newDay]}`});
            shifts = await MKR.db.getAll('shifts'); draw();
          }
          dragId=null;
        });
        cell.onclick=(e)=>{ if(e.target.closest('.shift-chip')||e.target.dataset.rm) return; addShift(+cell.dataset.day); };
      });
      U.qsa('[data-rm]',c).forEach(b=> b.onclick=async(e)=>{ e.stopPropagation();
        await MKR.db.remove('shifts', b.dataset.rm); await MKR.audit.log({action:'shift.remove', desc:'删除排班'});
        shifts = await MKR.db.getAll('shifts'); draw(); });
    }

    function addShift(day){
      const opts = staff.map(s=>`<option value="${s.id}">${s.name} · ${({casual:'Casual',parttime:'PT',fulltime:'FT'})[s.employment]}${s.visa==='student'?' · 学生签':''}</option>`).join('');
      const wrap = U.el(`<div>
        <div class="field"><label>员工</label><select class="input" id="ss">${opts}</select></div>
        <div class="row"><div class="field grow"><label>开始</label><input class="input" id="st" type="time" value="09:00"></div>
        <div class="field grow"><label>结束</label><input class="input" id="et" type="time" value="15:00"></div></div>
        <div id="payPreview" class="disclaimer"></div>
      </div>`);
      function preview(){
        const st = staff.find(x=>x.id===U.qs('#ss',wrap).value);
        const p = MKR.pay.shiftPay(st, {start:U.qs('#st',wrap).value, end:U.qs('#et',wrap).value}, MKR.seed.dayTs(day));
        const jr = p.juniorPct<1 ? ` · 青少年费率 ${Math.round(p.juniorPct*100)}%（${st.age}岁）` : '';
        U.qs('#payPreview',wrap).innerHTML = `<span>💵</span><div>${p.dayLabel}费率 ${U.money(p.rate)}/h × ${p.hours}h ≈ <b>${U.money(p.pay)}</b>${jr}（参考，发薪前需确认）</div>`;
      }
      ['ss','st','et'].forEach(id=> U.qs('#'+id,wrap).addEventListener('input',preview)); preview();

      U.modal(`排班 · ${DAYS[day]}`, wrap, {actions:[
        {label:'保存排班', class:'btn-dark', onClick:async(close)=>{
          const staffId = U.qs('#ss',wrap).value, start=U.qs('#st',wrap).value, end=U.qs('#et',wrap).value;
          const st = staff.find(x=>x.id===staffId);
          const newH = hrs(start,end);
          if(newH<=0){ U.toast('结束时间需晚于开始','red'); return; }
          // 学生签硬卡控
          if(st.visa==='student'){
            const have = await fortnightHours(staffId);
            if(have+newH > settings.visaCapFortnight){
              close();
              U.modal('🛂 签证工时超限 · 禁止保存', `
                <div class="alert red"><span>⛔</span><div><b>${st.name}（学生签）</b>本双周已排 ${have}h，再加 ${newH}h 将达 ${have+newH}h，<b>超过 ${settings.visaCapFortnight}h 法定上限</b>。<br>为保护雇主合规，系统已禁止保存此排班。</div></div>`,
                {actions:[{label:'我知道了',class:'btn-dark',onClick:x=>x()}]});
              return;
            }
          }
          await MKR.db.put('shifts',{staffId, day, start, end});
          await MKR.audit.log({action:'shift.create', desc:`${st.name} ${DAYS[day]} ${start}-${end}`});
          shifts = await MKR.db.getAll('shifts'); close(); draw(); U.toast('排班已保存','green');
        }}
      ]});
    }
    draw();
  }

  // ---------- 一键招人 ----------
  async function hire(c){
    const pending = (await MKR.db.getAll('users')).filter(u=>u.role==='staff' && !u.onboarded);
    c.innerHTML = `
      <div class="section-head"><div><h2>一键智能招人</h2><p>输入手机号 + 工时类型，自动生成合规入职链接发给新人</p></div></div>
      <div class="grid g2" style="align-items:start">
        <div class="card" style="padding:22px">
          <div class="field"><label>新人手机号</label><input class="input" id="hphone" placeholder="04XX XXX XXX" inputmode="tel"></div>
          <div class="field"><label>姓名（可选）</label><input class="input" id="hname" placeholder="如 留空则用手机号"></div>
          <div class="row">
            <div class="field grow"><label>工时类型</label><select class="input" id="htype"><option value="casual">Casual 临时工</option><option value="parttime">Part-time 兼职</option><option value="fulltime">Full-time 全职</option></select></div>
            <div class="field grow"><label>职位</label><select class="input" id="hpos"><option>厨房帮工</option><option>水台</option><option>楼面/服务</option><option>收银</option><option>主厨</option></select></div>
          </div>
          <div class="field"><label>是否持学生签证</label><select class="input" id="hvisa"><option value="none">否</option><option value="student">是 · 学生签（启用工时卡控）</option></select></div>
          <button class="btn btn-accent btn-block" id="hbtn">📩 生成入职包并发送链接</button>
          <div class="disclaimer mt12"><span>📋</span>入职包自动包含 TFN 税务声明、Super 选择、银行信息电子表单（符合 Fair Work / Privacy Act）。</div>
        </div>
        <div class="card" style="padding:22px">
          <div class="section-title">待入职 / 入职中</div>
          <div class="list" id="plist"></div>
        </div>
      </div>`;
    function drawPending(list){
      const el = U.qs('#plist',c);
      if(!list.length){ el.innerHTML = `<div class="empty"><div class="em">👥</div><p>暂无待入职新人</p></div>`; return; }
      el.innerHTML = list.map(u=>`<div class="li"><div class="ava">${U.initials(u.name)}</div>
        <div class="meta"><b>${U.esc(u.name)}</b><span>${u.position||''} · ${({casual:'Casual',parttime:'PT',fulltime:'FT'})[u.employment]} · ${u.onboarded?'已完成':'等待填写资料'}</span></div>
        <button class="btn btn-ghost btn-sm" data-link="${u.username}">复制链接</button></div>`).join('');
      U.qsa('[data-link]',el).forEach(b=>b.onclick=()=>{
        const link = `${location.origin}${location.pathname}#/staff/onboarding`;
        navigator.clipboard?.writeText(link).then(()=>U.toast('入职链接已复制','green')).catch(()=>U.toast('链接：登录员工端 → 我的入职'));
      });
    }
    drawPending(pending);

    U.qs('#hbtn',c).onclick = async ()=>{
      const phone = U.qs('#hphone',c).value.trim().replace(/\s/g,'');
      if(!phone){ U.toast('请填写手机号','red'); return; }
      const name = U.qs('#hname',c).value.trim() || ('新人'+phone.slice(-4));
      const username = phone, password = 'mkr'+phone.slice(-4);   // 默认密码(≥6),可让员工首次登录后改
      const staffId = MKR.util.uid('u');
      const btn = U.qs('#hbtn',c); btn.disabled=true; btn.textContent='创建账号中…';

      // 1) 创建登录账号(副客户端，不影响经理登录态)
      let uid=null, authMsg='';
      if(MKR.supa.signupClient){
        const {data,error}=await MKR.supa.signupClient.auth.signUp({email:MKR.supa.emailFor(username), password});
        if(data&&data.user) uid=data.user.id;
        else if(error && /regist|exist/i.test(error.message)){ const {data:si}=await MKR.supa.signupClient.auth.signInWithPassword({email:MKR.supa.emailFor(username),password}); if(si&&si.user) uid=si.user.id; }
        else if(error) authMsg=error.message;
        await MKR.supa.signupClient.auth.signOut().catch(()=>{});
      }
      // 2) 员工数据 + profile(角色)
      await MKR.db.put('users',{ id:staffId, role:'staff', name, username,
        employment:U.qs('#htype',c).value, position:U.qs('#hpos',c).value, visa:U.qs('#hvisa',c).value,
        emoji:'🧑‍🍳', onboarded:false, age:null, baseRate:24.10, createdAt:Date.now() });
      if(uid && MKR.supa.client) await MKR.supa.client.from('profiles').upsert({id:uid, username, name, role:'staff', staff_id:staffId, emoji:'🧑‍🍳', active:true});
      await MKR.audit.log({action:'staff.hire', desc:`招聘 ${name}`});
      btn.disabled=false; btn.textContent='📩 生成入职包并发送链接';

      U.modal('✅ 员工账号已创建', `
        ${authMsg?`<div class="alert amber"><span>⚠️</span><div>账号创建提示：${U.esc(authMsg)}（员工数据已存，可稍后重试建号）</div></div>`:`<div class="alert green"><span>🔑</span><div>已为 <b>${U.esc(name)}</b> 创建独立登录账号。</div></div>`}
        <div class="field mt12"><label>把这个登录信息发给新人</label>
          <input class="input" value="用户名 ${U.esc(username)} · 密码 ${U.esc(password)}" readonly onclick="this.select()"></div>
        <p class="muted" style="font-size:13px">新人登录员工端后，到「我的资料」填写 TFN / Super / 银行信息。</p>`,
        {actions:[{label:'完成',class:'btn-dark',onClick:x=>{x(); hire(c);}}]});
      U.qs('#hphone',c).value=''; U.qs('#hname',c).value='';
    };
  }

  // ---------- 任务清单审核 ----------
  async function tasks(c){
    let list = (await MKR.db.getAll('tasks')).filter(t=>t.date===U.todayISO());
    c.innerHTML = `
      <div class="section-head"><div><h2>每日任务清单</h2><p>发布卫生 / 备料 / 温度检查 · 审核员工提交的电子日志与照片</p></div>
        <button class="btn btn-ghost btn-sm" id="addTask">+ 新增任务</button></div>
      <div id="tlist"></div>`;
    function draw(){
      const el = U.qs('#tlist',c);
      const done = list.filter(t=>t.done).length;
      el.innerHTML = `<div class="card stat" style="margin-bottom:16px"><div class="k">今日完成进度</div>
        <div class="v">${done}<small> / ${list.length}</small></div><div class="bar"><i style="width:${list.length?done/list.length*100:0}%"></i></div></div>` +
        list.map(t=>`<div class="task-item ${t.done?'done':''}">
          <div class="task-check ${t.done?'done':''}">${t.done?'✓':''}</div>
          <div class="grow"><b>${U.esc(t.name)}</b><div class="faint" style="font-size:12px">${t.done?`${U.esc(t.by||'')} · ${t.value?U.esc(t.value)+' · ':''}已提交`:'待员工完成'}</div></div>
          ${t.photo?`<img class="thumb" src="${t.photo}" data-img="${t.id}">`:'<span class="pill ghost">无照片</span>'}
        </div>`).join('');
      U.qsa('[data-img]',el).forEach(im=> im.onclick=()=> U.modal('提交照片', `<img src="${im.src}" style="width:100%;border-radius:12px">`));
    }
    draw();
    MKR.db.on('tasks', async()=>{ list=(await MKR.db.getAll('tasks')).filter(t=>t.date===U.todayISO()); draw(); });
    U.qs('#addTask',c).onclick=()=>{
      const wrap=U.el(`<div class="field"><label>任务名称</label><input class="input" id="tn" placeholder="如 油烟机清洁"></div>`);
      U.modal('新增任务',wrap,{actions:[{label:'发布',class:'btn-dark',onClick:async(cl)=>{
        const nm=U.qs('#tn',wrap).value.trim(); if(!nm) return;
        await MKR.db.put('tasks',{name:nm, date:U.todayISO(), done:false, photo:null, by:null});
        list=(await MKR.db.getAll('tasks')).filter(t=>t.date===U.todayISO()); cl(); draw(); U.toast('任务已发布','green');
      }}]});
    };
  }

  // ---------- 换班 / SOS ----------
  async function swaps(c){
    const staff = await staffList();
    function nameOf(id){ const s=staff.find(x=>x.id===id); return s?s.name:'?'; }
    let sw = (await MKR.db.getAll('swaps'));
    let sos = (await MKR.db.getAll('sos')).filter(s=>s.status!=='closed');
    c.innerHTML = `
      <div class="section-head"><div><h2>换班 / SOS 调度</h2><p>审批员工换班申请 · 暴单时一键发布带奖励的紧急顶班</p></div>
        <button class="btn btn-accent btn-sm" id="sosBtn">🆘 发布 SOS 顶班</button></div>
      <div class="grid g2" style="align-items:start">
        <div class="card" style="padding:20px"><div class="section-title">换班申请待审批</div><div class="list" id="swlist"></div></div>
        <div class="card" style="padding:20px"><div class="section-title">进行中的 SOS 顶班</div><div class="list" id="soslist"></div></div>
      </div>`;
    function drawSwaps(){
      const el=U.qs('#swlist',c); const pend=sw.filter(s=>s.status==='pending');
      if(!pend.length){ el.innerHTML=`<div class="empty"><div class="em">🔁</div><p>暂无待审批换班</p></div>`; return; }
      el.innerHTML=pend.map(s=>`<div class="li"><div class="ava">${U.initials(nameOf(s.staffId))}</div>
        <div class="meta"><b>${nameOf(s.staffId)} 申请换出班次</b><span>${s.label||''} · ${s.reason||'临时有事'}</span></div>
        <div class="row gap6"><button class="btn btn-green btn-sm" data-ap="${s.id}">批准</button><button class="btn btn-ghost btn-sm" data-rj="${s.id}">驳回</button></div></div>`).join('');
      U.qsa('[data-ap]',el).forEach(b=>b.onclick=async()=>{ await MKR.db.put('swaps',{id:b.dataset.ap,status:'approved'}); await MKR.audit.log({action:'swap.approve',desc:'换班审批通过'}); sw=await MKR.db.getAll('swaps'); drawSwaps(); U.toast('已批准，进入换班市场','green'); });
      U.qsa('[data-rj]',el).forEach(b=>b.onclick=async()=>{ await MKR.db.put('swaps',{id:b.dataset.rj,status:'rejected'}); sw=await MKR.db.getAll('swaps'); drawSwaps(); });
    }
    function drawSos(){
      const el=U.qs('#soslist',c);
      if(!sos.length){ el.innerHTML=`<div class="empty"><div class="em">📣</div><p>暂无进行中的 SOS</p></div>`; return; }
      el.innerHTML=sos.map(s=>`<div class="li"><div class="ava">🆘</div>
        <div class="meta"><b>${U.esc(s.title)}</b><span>奖励 ${U.esc(s.reward)} · ${s.claimedBy?('已被 '+nameOf(s.claimedBy)+' 抢单 ✅'):'等待抢单'}</span></div>
        ${s.claimedBy?'<span class="pill ok">已顶班</span>':'<span class="pill warn">招募中</span>'}</div>`).join('');
    }
    drawSwaps(); drawSos();
    MKR.db.on('swaps', async()=>{ sw=await MKR.db.getAll('swaps'); drawSwaps(); });
    MKR.db.on('sos', async()=>{ sos=(await MKR.db.getAll('sos')).filter(s=>s.status!=='closed'); drawSos(); });
    U.qs('#sosBtn',c).onclick=()=>{
      const wrap=U.el(`<div>
        <div class="field"><label>时段 / 说明</label><input class="input" id="st" placeholder="如 今晚 18:00 暴单缺 1 人"></div>
        <div class="field"><label>奖励</label><input class="input" id="rw" value="加薪 +$40 / 送餐"></div></div>`);
      U.modal('🆘 发布 SOS 紧急顶班',wrap,{actions:[{label:'推送给空闲员工',class:'btn-accent',onClick:async(cl)=>{
        const title=U.qs('#st',wrap).value.trim()||'紧急顶班'; const reward=U.qs('#rw',wrap).value.trim();
        await MKR.db.put('sos',{title,reward,status:'open',claimedBy:null,ts:Date.now()});
        await MKR.audit.log({action:'sos.post',desc:'发布 SOS：'+title});
        sos=(await MKR.db.getAll('sos')).filter(s=>s.status!=='closed'); cl(); drawSos(); U.toast('SOS 已推送给所有空闲员工','green');
      }}]});
    };
  }
})();
