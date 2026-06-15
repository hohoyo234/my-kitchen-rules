/* ===== 老板端 Owner Portal ===== */
window.MKR = window.MKR || {}; MKR.portals = MKR.portals || {};
(function(){
  const U = MKR.util;
  const DAYS=['周一','周二','周三','周四','周五','周六','周日'];
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

  // 扫描今日班次：计划开始已过 1 小时仍无打卡 → No Show 警报（去重）
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
        await MKR.alerts.raise({key:'noshow-'+s.id, level:'red', type:'noshow', title:'员工 No Show 风险',
          desc:`${u?u.name:'员工'} 的 ${DAYS[s.day]} ${s.start} 班已过 1 小时仍未打卡`});
      }
    }
  }

  MKR.portals.owner = {
    home:'dashboard', subtitle:'睡后管理 · 只看结果、只做审批',
    nav:[
      {id:'dashboard', label:'核心看板', em:'📊', short:'看板'},
      {id:'report',    label:'每日日报', em:'📩', short:'日报'},
      {id:'alerts',    label:'红色警报', em:'🚨', short:'警报'},
      {id:'audit',     label:'操作审计', em:'🔍', short:'审计'},
      {id:'labor',     label:'人工成本', em:'💰', short:'成本'},
      {id:'team',      label:'团队管理', em:'👥', short:'团队'},
      {id:'compliance',label:'合规守护', em:'🛡️', short:'合规'},
    ],
    async badges(){ const a=(await MKR.db.getAll('alerts')).filter(x=>!x.read && x.level==='red').length; return a?{alerts:a}:{}; },
    async view(section,c){
      if(section==='dashboard') return dashboard(c);
      if(section==='report') return report(c);
      if(section==='alerts') return alerts(c);
      if(section==='audit') return audit(c);
      if(section==='labor') return labor(c);
      if(section==='team') return team(c);
      if(section==='compliance') return compliance(c);
    }
  };

  // ---------- 看板 ----------
  async function dashboard(c){
    await noShowScan();
    const m = await metrics();
    const vClass = m.variance==null?'flat':(Math.abs(m.variance)<=20?'flat':'down');
    c.innerHTML = `
      <div class="section-head"><div><h2>核心看板</h2><p>系统平时静默运行，出问题才打扰你</p></div></div>
      <div class="grid g4" style="margin-bottom:18px">
        <div class="card stat"><div class="k">📈 今日营业额</div><div class="v">${U.money0(m.revenue)}</div><div class="delta up">实时统计</div></div>
        <div class="card stat"><div class="k">💵 盲对账差异</div><div class="v">${m.variance==null?'—':(m.variance>=0?'+':'')+U.money0(m.variance)}</div><div class="delta ${vClass}">${m.variance==null?'今日未对账':(Math.abs(m.variance)<=20?'正常':'超阈值')}</div></div>
        <div class="card stat"><div class="k">🧾 今日订单</div><div class="v">${m.count}<small> 单</small></div><div class="delta flat">已收款</div></div>
        <div class="card stat"><div class="k">🚨 未读警报</div><div class="v" style="color:${m.alerts.length?'var(--red)':'inherit'}">${m.alerts.length}</div><div class="delta flat">${m.alerts.length?'需关注':'一切正常'}</div></div>
      </div>
      <div class="grid g2" style="align-items:start">
        <div class="card" style="padding:20px">
          <div class="section-title">🚨 红色警报 · 只在出事时打扰<a href="#/owner/alerts" class="faint" style="font-size:12px">全部 →</a></div>
          <div id="aprev"></div>
        </div>
        <div class="card" style="padding:20px">
          <div class="section-title">📩 今日速览<a href="#/owner/report" class="faint" style="font-size:12px">完整日报 →</a></div>
          <div class="list">
            <div class="li"><div class="ava">💰</div><div class="meta"><b>${U.money(m.revenue)}</b><span>今日营业额</span></div></div>
            <div class="li"><div class="ava">💵</div><div class="meta"><b>${m.variance==null?'待对账':(m.variance>=0?'+':'')+U.money(m.variance)}</b><span>现金盲对账差异</span></div></div>
            <div class="li"><div class="ava">📅</div><div class="meta"><b>8 桌</b><span>明日预订（示例）</span></div></div>
          </div>
        </div>
      </div>
      <div class="disclaimer mt16"><span>ℹ️</span>本系统提供数据汇总与导出，不直接对接 ATO、不提供税务建议，最终税务申报数字以会计师确认为准。</div>`;
    const ap = U.qs('#aprev',c);
    const red = m.alerts.slice(0,4);
    ap.innerHTML = red.length? red.map(a=>`<div class="alert ${a.level==='red'?'red':'amber'}" style="margin-bottom:10px"><span>${a.level==='red'?'⚠️':'🔔'}</span><div><b>${U.esc(a.title)}</b><br>${U.esc(a.desc)} · <span class="faint">${U.ago(a.ts)}</span></div></div>`).join('')
      : `<div class="empty"><div class="em">😌</div><p>暂无异常，系统静默运行中</p></div>`;
  }

  // ---------- 每日日报 ----------
  async function report(c){
    const m = await metrics();
    const line = `今日营业额 ${U.money(m.revenue)}，${m.count} 单；现金差异 ${m.variance==null?'未对账':(m.variance>=0?'+':'')+U.money(m.variance)}；明日预订 8 桌。`;
    c.innerHTML = `
      <div class="section-head"><div><h2>每日智能日报</h2><p>打烊后自动推送一条极简日报到你手机，无需登录即可掌握全局</p></div></div>
      <div class="card" style="padding:26px;max-width:560px">
        <div class="row center gap8" style="margin-bottom:14px"><div class="ava" style="width:42px;height:42px;border-radius:12px;background:var(--ink);color:var(--paper);display:grid;place-items:center">📩</div><div><b>My Kitchen 管家</b><div class="faint" style="font-size:12px">${U.fmtDateTime(Date.now())} · 打烊推送</div></div></div>
        <div style="background:var(--paper-2);border-radius:16px;padding:18px;font-size:16px;line-height:1.7">${line}</div>
        <div class="grid g3 mt16">
          <div class="card stat"><div class="k">营业额</div><div class="v" style="font-size:22px">${U.money0(m.revenue)}</div></div>
          <div class="card stat"><div class="k">订单</div><div class="v" style="font-size:22px">${m.count}</div></div>
          <div class="card stat"><div class="k">现金差异</div><div class="v" style="font-size:22px">${m.variance==null?'—':(m.variance>=0?'+':'')+U.money0(m.variance)}</div></div>
        </div>
        <button class="btn btn-dark btn-block mt16" id="push">📲 重新推送到我的手机</button>
      </div>`;
    U.qs('#push',c).onclick=()=>U.toast('日报已推送（演示环境不真实发送）','green');
  }

  // ---------- 红色警报 ----------
  async function alerts(c){
    let list=(await MKR.db.getAll('alerts')).sort((a,b)=>b.ts-a.ts);
    function draw(){
      c.innerHTML=`<div class="section-head"><div><h2>异常红色警报</h2><p>盲对账差异超标 / 大额退款 / 员工迟到等才会推送</p></div>
        ${list.some(a=>!a.read)?'<button class="btn btn-ghost btn-sm" id="readAll">全部标为已读</button>':''}</div>
        <div id="al"></div>`;
      const el=U.qs('#al',c);
      if(!list.length){ el.innerHTML=`<div class="empty"><div class="em">😌</div><p>暂无任何警报，一切正常</p></div>`; return; }
      el.innerHTML=list.map(a=>`<div class="alert ${a.level==='red'?'red':'amber'}" style="margin-bottom:12px;${a.read?'opacity:.55':''}"><span>${a.level==='red'?'⚠️':'🔔'}</span>
        <div class="grow"><b>${U.esc(a.title)}</b><br>${U.esc(a.desc)} · <span class="faint">${U.ago(a.ts)}</span></div>
        ${a.read?'<span class="pill ghost">已读</span>':`<button class="btn btn-ghost btn-sm" data-r="${a.id}">标记已读</button>`}</div>`).join('');
      U.qsa('[data-r]',el).forEach(b=>b.onclick=async()=>{ await MKR.db.put('alerts',{id:b.dataset.r,read:true}); list=(await MKR.db.getAll('alerts')).sort((x,y)=>y.ts-x.ts); draw(); });
      const ra=U.qs('#readAll',c); if(ra) ra.onclick=async()=>{ for(const a of list) if(!a.read) await MKR.db.put('alerts',{id:a.id,read:true}); list=(await MKR.db.getAll('alerts')).sort((x,y)=>y.ts-x.ts); draw(); };
    }
    draw();
  }

  // ---------- 操作审计 ----------
  async function audit(c){
    const logs=await MKR.audit.all();
    c.innerHTML=`<div class="section-head"><div><h2>敏感操作审计</h2><p>改单 / 取消 / 打折 / 退款全程留痕 · 只追加不可篡改</p></div>
      <span class="pill ghost">🔒 Append-only · ${logs.length} 条</span></div>
      <div class="card" style="padding:8px 18px"><div class="list">
      ${logs.length? logs.map(l=>`<div class="li"><div class="ava">${iconOf(l.action)}</div>
        <div class="meta"><b>${MKR.audit.label(l.action)}${l.amount!=null?' · '+U.money(l.amount):''}</b><span>${U.esc(l.desc||'')}</span></div>
        <div style="text-align:right"><div style="font-size:13px;font-weight:600">${U.esc(l.actor||'系统')}</div><div class="faint" style="font-size:11.5px">${U.fmtDateTime(l.ts)}</div></div></div>`).join('')
        : '<div class="empty"><div class="em">🗂️</div><p>暂无操作记录</p></div>'}
      </div></div>
      <div class="disclaimer mt16"><span>🔒</span>审计日志采用只追加（append-only）结构，系统不提供任何删除或修改入口。</div>`;
    function iconOf(a){ return ({'order.refund':'↩️','order.discount':'🏷️','order.cancel':'✖️','order.create':'🧾','pay.blinddrop':'🥁','staff.offboard':'🔒','staff.hire':'➕','tfn.view':'🪪','login':'🔑','shift.create':'📅','shift.remove':'🗑️','sos.post':'🆘','labor.approve':'✅','labor.reject':'⛔','swap.approve':'🔁'})[a]||'•'; }
  }

  // ---------- 人工成本审批 ----------
  async function labor(c){
    const settings=await MKR.db.meta('settings');
    const staff=(await MKR.db.getAll('users')).filter(u=>u.role==='staff'&&!u.offboarded);
    const shifts=await MKR.db.getAll('shifts');
    const staffOf=id=>staff.find(s=>s.id===id)||{baseRate:0,employment:'casual',name:'?'};
    const wage=shifts.reduce((t,s)=>t+MKR.pay.shiftPay(staffOf(s.staffId),s,MKR.seed.dayTs(s.day)).pay,0);
    const fc=settings.revenueForecast; const pct=wage/fc; const over=pct>settings.laborPctThreshold;
    const approved = await MKR.db.meta('laborApproved');

    c.innerHTML=`
      <div class="section-head"><div><h2>人工成本审批</h2><p>系统预测下周营业额与人工费占比，超标自动弹红色预警</p></div></div>
      <div class="grid g3" style="margin-bottom:18px">
        <div class="card stat"><div class="k">下周预估营业额</div><div class="v">${U.money0(fc)}</div></div>
        <div class="card stat"><div class="k">排班总薪资（参考）</div><div class="v">${U.money0(wage)}</div></div>
        <div class="card stat"><div class="k">人工费占比</div><div class="v" style="color:${over?'var(--red)':'var(--green)'}">${(pct*100).toFixed(0)}<small>%</small></div><div class="delta flat">红线 ${(settings.laborPctThreshold*100).toFixed(0)}%</div></div>
      </div>
      ${over?`<div class="alert red" style="margin-bottom:16px"><span>⚠️</span><div><b>人工成本超标</b> · 占比 ${(pct*100).toFixed(0)}% 高于红线 ${(settings.laborPctThreshold*100).toFixed(0)}%，需要你审批本周排班。</div></div>`
            :`<div class="alert green" style="margin-bottom:16px"><span>✅</span><div>人工费占比健康，无需特别关注。</div></div>`}
      <div class="card" style="padding:22px;max-width:560px">
        <div class="section-title">本周排班成本审批</div>
        ${approved?`<div class="alert green"><span>✅</span><div>你已于 ${U.fmtDateTime(approved)} 审批通过本周排班。</div></div>`:`
        <p class="muted" style="font-size:14px">薪资数字为系统按 Award 自动计算的<b>参考值</b>，请人工核对后确认。</p>
        <div class="row gap8 mt16"><button class="btn btn-green grow" id="ap">一键审批通过</button><button class="btn btn-ghost grow" id="rj">驳回 · 要求调整</button></div>`}
        <div class="disclaimer mt16"><span>⚖️</span>计算结果供参考，以雇主最终确认为准；本系统不提供税务建议、不直接申报。</div>
      </div>`;
    const ap=U.qs('#ap',c), rj=U.qs('#rj',c);
    if(ap) ap.onclick=async()=>{ await MKR.db.meta('laborApproved',Date.now()); await MKR.audit.log({action:'labor.approve',desc:`审批本周排班 · 占比${(pct*100).toFixed(0)}%`,amount:wage}); U.toast('已审批通过','green'); labor(c); };
    if(rj) rj.onclick=async()=>{ await MKR.audit.log({action:'labor.reject',desc:'驳回排班 · 要求调整'}); U.toast('已驳回，已通知经理调整','amber'); };
  }

  // ---------- 团队管理（离职熔断 + TFN 调取 + Super + 签证）----------
  async function team(c){
    const settings=await MKR.db.meta('settings');
    let users=(await MKR.db.getAll('users')).filter(u=>u.role==='staff');
    const shifts=await MKR.db.getAll('shifts');
    const onboard=await MKR.db.getAll('onboarding');
    function visaHours(id){ return shifts.filter(s=>s.staffId===id).reduce((t,s)=>t+MKR.pay.hours(s.start,s.end),0); }

    function draw(){
      c.innerHTML=`
        <div class="section-head"><div><h2>团队管理</h2><p>离职一键熔断 · TFN 加密调取 · 签证工时总览</p></div></div>
        <div class="card" style="padding:8px 18px"><div class="list" id="tlist"></div></div>
        <div class="disclaimer mt16"><span>🔒</span>仅老板角色可调取 TFN（每次调取均记入审计日志）；离职员工合规数据加密留存 7 年备审计。</div>`;
      const el=U.qs('#tlist',c);
      el.innerHTML=users.map(u=>{
        const h=visaHours(u.id); const near=u.visa==='student'&&h>=settings.visaCapFortnight-6;
        const ob=onboard.find(o=>o.userId===u.id);
        return `<div class="li"><div class="ava">${u.emoji||U.initials(u.name)}</div>
          <div class="meta"><b>${U.esc(u.name)} ${u.offboarded?'<span class="pill danger">已离职</span>':''}</b>
            <span>${u.position||({casual:'Casual',parttime:'兼职',fulltime:'全职'})[u.employment]||''} ${u.visa==='student'?`· 学生签 <b style="color:${near?'var(--red)':'inherit'}">${h}/${settings.visaCapFortnight}h</b>`:''} ${u.onboarded?'· 已入职':'· 待入职'}</span></div>
          <div class="row gap6">
            ${ob?`<button class="btn btn-ghost btn-sm" data-tfn="${u.id}">🪪 调取 TFN</button>`:''}
            ${u.offboarded?`<button class="btn btn-ghost btn-sm" data-restore="${u.id}">恢复</button>`:`<button class="btn btn-danger btn-sm" data-off="${u.id}">离职熔断</button>`}
          </div></div>`;
      }).join('');
      U.qsa('[data-off]',el).forEach(b=>b.onclick=()=>offboard(b.dataset.off));
      U.qsa('[data-restore]',el).forEach(b=>b.onclick=async()=>{ await MKR.db.put('users',{id:b.dataset.restore,offboarded:false}); if(MKR.supa.client) await MKR.supa.client.from('profiles').update({active:true}).eq('staff_id',b.dataset.restore); users=(await MKR.db.getAll('users')).filter(u=>u.role==='staff'); draw(); });
      U.qsa('[data-tfn]',el).forEach(b=>b.onclick=()=>viewTfn(b.dataset.tfn));
    }
    async function offboard(id){
      const u=users.find(x=>x.id===id);
      if(await U.confirm('一键安全离职熔断',`确定将 ${u.name} 标记为已离职？其账号将被【数据库层停用】，立即无法访问任何数据，合规数据加密留存 7 年。`,{ok:'确认熔断',danger:true})){
        const now=Date.now();
        await MKR.db.put('users',{id,offboarded:true, archivedAt:now, retentionUntil: now + 7*365*24*3600*1000});
        if(MKR.supa.client) await MKR.supa.client.from('profiles').update({active:false}).eq('staff_id',id);
        await MKR.audit.log({action:'staff.offboard',desc:`离职熔断 · ${u.name}（合规留存至 ${new Date(now+7*365*24*3600*1000).toISOString().slice(0,10)}）`});
        users=(await MKR.db.getAll('users')).filter(x=>x.role==='staff'); draw();
        U.toast(`${u.name} 权限已熔断`,'red');
      }
    }
    async function viewTfn(id){
      const u=users.find(x=>x.id===id); const ob=onboard.find(o=>o.userId===id);
      const tfn=await MKR.crypto.dec(ob.tfnEnc);
      await MKR.audit.log({action:'tfn.view',desc:`调取 ${u.name} 的 TFN`});
      U.modal('🪪 TFN 调取 · '+u.name, `
        <div class="alert amber" style="margin-bottom:14px"><span>🔒</span><div>本次调取已记入审计日志。请勿截屏外传。</div></div>
        <div class="field"><label>税号 TFN（已解密）</label><input class="input" value="${U.esc(tfn)}" readonly onclick="this.select()"></div>
        <p class="faint" style="font-size:12px">加密方式：${ob.tfnEnc.startsWith('aes:')?'AES-GCM':'本地混淆'} · 仅老板角色可见。</p>`,
        {actions:[{label:'关闭',class:'btn-dark',onClick:x=>x()}]});
    }
    draw();
  }

  // ---------- 合规守护 ----------
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
      <div class="section-head"><div><h2>合规守护</h2><p>Super 提醒 · 签证工时 · 食品安全审计报告</p></div></div>
      <div class="grid g2" style="align-items:start">
        <div class="card" style="padding:22px">
          <div class="section-title">💼 Super 缴纳提醒</div>
          <div class="stat" style="padding:0"><div class="v">${U.money0(superDue)}</div><div class="delta flat">按 ${(settings.superRate*100).toFixed(1)}% 估算 · 截止 ${settings.superDue}</div></div>
          <div class="alert amber mt12"><span>⏰</span><div>本季度 Super 截止日前请确认缴纳，避免逾期罚款。</div></div>
          <button class="btn btn-ghost btn-sm btn-block mt12" id="superRemind">设为已提醒</button>
        </div>
        <div class="card" style="padding:22px">
          <div class="section-title">🛂 签证工时监控总览</div>
          <div class="list">
            ${stu.length? stu.map(s=>{ const h=shifts.filter(x=>x.staffId===s.id).reduce((t,x)=>t+MKR.pay.hours(x.start,x.end),0); const near=h>=settings.visaCapFortnight-6;
              return `<div class="li"><div class="ava">${U.initials(s.name)}</div><div class="meta"><b>${s.name}</b><span>学生签 · 双周上限 ${settings.visaCapFortnight}h</span></div>
              <span class="pill ${near?'danger':'ok'}">${h}/${settings.visaCapFortnight}h</span></div>`; }).join('')
              : '<div class="empty"><div class="em">🛂</div><p>暂无学生签员工</p></div>'}
          </div>
        </div>
      </div>
      <div class="card mt16" style="padding:22px">
        <div class="section-title">📋 食品安全审计报告（一键导出）</div>
        <p class="muted" style="font-size:14px">汇总员工端的冰箱温度打卡、卫生任务记录，按 Council 食品安全审计格式生成报告。今日已记录 ${tasks.filter(t=>t.done).length}/${tasks.length} 项。</p>
        <div class="row gap8 mt12 wrap">
          <button class="btn btn-dark btn-sm" id="exportFood">📄 导出今日食品安全记录</button>
          <button class="btn btn-ghost btn-sm" id="exportCsv">📊 导出营业 / 工资 CSV</button>
        </div>
      </div>
      <div class="card mt16" style="padding:22px">
        <div class="section-title">🗄️ 离职员工合规数据留存（7 年）</div>
        <p class="muted" style="font-size:14px">离职员工的资料不会删除，按澳洲审计要求加密留存 7 年；TFN 等敏感字段仍仅老板可调取。</p>
        <div class="list mt8">
          ${archived.length? archived.map(u=>{
            const ru=u.retentionUntil? new Date(u.retentionUntil).toISOString().slice(0,10):'—';
            const au=u.archivedAt? new Date(u.archivedAt).toISOString().slice(0,10):'—';
            return `<div class="li"><div class="ava">🗄️</div><div class="meta"><b>${U.esc(u.name)}</b><span>离职于 ${au} · 数据已加密留存</span></div><span class="pill ghost">留存至 ${ru}</span></div>`;
          }).join('') : '<div class="empty"><div class="em">🗄️</div><p>暂无离职归档</p></div>'}
        </div>
      </div>
      <div class="disclaimer mt16"><span>⚖️</span>本系统提供数据汇总与导出，不直接对接 ATO、不提供税务建议；工资与税务最终数字以会计师 / 雇主确认为准。</div>
      <div class="row mt24"><button class="btn btn-ghost btn-sm" id="resetBtn">↺ 重置演示数据</button></div>`;

    U.qs('#superRemind',c).onclick=async()=>{ await MKR.audit.log({action:'super.remind',desc:'Super 提醒已确认',amount:superDue}); U.toast('已记录','green'); };
    U.qs('#exportFood',c).onclick=()=>exportFood(tasks);
    U.qs('#exportCsv',c).onclick=()=>exportCsv();
    U.qs('#resetBtn',c).onclick=async()=>{ if(await U.confirm('重置演示数据','将清空所有本地数据并重新载入演示账号，确定？',{ok:'重置',danger:true})) MKR.seed.reset(); };
  }

  function download(name,content,type){ const b=new Blob([content],{type}); const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=name; a.click(); URL.revokeObjectURL(a.href); }
  function exportFood(tasks){
    const rows=['食品安全记录,'+U.todayISO(),'任务,状态,记录值,执行人,时间'];
    tasks.forEach(t=>rows.push(`${t.name},${t.done?'已完成':'未完成'},${t.value||''},${t.by||''},${t.done?'已提交':''}`));
    download('food-safety-'+U.todayISO()+'.csv','﻿'+rows.join('\n'),'text/csv');
    MKR.audit.log({action:'export',desc:'导出食品安全记录'}); U.toast('已导出 CSV','green');
  }
  async function exportCsv(){
    const orders=(await MKR.db.getAll('orders')).filter(o=>isToday(o.createdAt));
    const rows=['订单号,金额AUD,支付方式,状态,时间'];
    orders.forEach(o=>rows.push(`${o.id.slice(-4)},${o.total.toFixed(2)},${o.method==='cash'?'现金':'刷卡'},${o.status},${U.fmtDateTime(o.createdAt)}`));
    download('sales-'+U.todayISO()+'.csv','﻿'+rows.join('\n'),'text/csv');
    MKR.audit.log({action:'export',desc:'导出营业数据 CSV'}); U.toast('已导出 CSV','green');
  }
})();
