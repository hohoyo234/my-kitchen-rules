/* ===== 全能助手 · AI Admin agent (owner full-page) =====
   The owner just types a request and the assistant does it: answer any data
   question, or perform a real in-app action (sold-out, coupon, booking, queue,
   draft a summary). Two modes:
     • 手动 (manual)  — proposes the action, you tap 确认 before it runs.
     • 自动 (auto)    — runs it immediately and reports back.
   Anything that isn't a known action is answered via MKR.assistant (KB + live
   data + optional LLM). Actions are local-first so they work without any
   backend redeploy.
*/
window.MKR = window.MKR || {}; MKR.views = MKR.views || {};
(function(){
  const U = MKR.util;
  const MODE_KEY = 'mkr_ai_mode';
  const mode    = ()=> localStorage.getItem(MODE_KEY)==='auto' ? 'auto' : 'manual';
  const setMode = (m)=> localStorage.setItem(MODE_KEY, m);
  const kid = ()=> (MKR.auth.current()||{}).kitchenId || 'k_main';

  let logEl=null;

  async function kitchenMenu(){ return (await MKR.db.getAll('menu')).filter(m=>(m.kitchenId||'k_main')===kid()); }
  function numOf(re, t){ const m=t.match(re); return m?+m[1]:null; }
  // Safe YYYY-MM-DD from a possibly-missing/invalid timestamp (never throws).
  function dayOf(ts){ const d=new Date(ts); return isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10); }

  // ---------- a compact daily summary (read-only) ----------
  async function dailySummary(){
    const today=U.todayISO();
    const orders=(await MKR.db.getAll('orders')).filter(o=>dayOf(o.createdAt)===today && o.status!=='cancelled' && o.status!=='refunded');
    const rev=orders.reduce((t,o)=>t+(o.total||0),0);
    const cnt={}; orders.forEach(o=>(o.items||[]).forEach(it=>{ cnt[it.nm]=(cnt[it.nm]||0)+(it.qty||1); }));
    const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([n,q])=>`${n}×${q}`);
    const staff=(await MKR.db.getAll('users')).filter(u=>u.role!=='owner' && !u.offboarded);
    const so=(await kitchenMenu()).filter(m=>m.soldOut).map(m=>m.nm);
    let waiting=0, bookings=0; try{ waiting=(await MKR.db.getAll('waitlist')).filter(q=>q.status==='waiting'||q.status==='called').length; bookings=(await MKR.db.getAll('reservations')).filter(r=>r.status==='booked'&&r.date>=today).length; }catch(e){}
    let members=0; try{ members=(await MKR.db.getAll('members')).length; }catch(e){}
    return `📊 <b>今日经营总结</b><br>
      • 营业额 <b>${U.money(rev)}</b> · ${orders.length} 单<br>
      ${top.length?`• 热销 ${top.join('、')}<br>`:''}
      • 团队 ${staff.filter(u=>u.role==='staff').length} 员工 / ${staff.filter(u=>u.role==='manager').length} 经理<br>
      • ${waiting} 桌等位 · ${bookings} 个预订 · ${members} 名会员<br>
      ${so.length?`• ⛔ 沽清中：${so.join('、')}`:'• 暂无沽清菜品'}`;
  }

  // ---------- action skills: return null OR {desc, run, [readOnly]} ----------
  const SKILLS = [
    // 沽清 / 恢复供应
    async function(t){
      const low=t.toLowerCase();
      const wantSold = /(沽清|卖完|售罄|sold ?out|86)/.test(low);
      const wantBack = /(恢复|有货|补货|back in stock|restock|in stock)/.test(low);
      if(!wantSold && !wantBack) return null;
      const hit=(await kitchenMenu()).find(m=> m.nm && low.includes(m.nm.toLowerCase()));
      if(!hit) return null;
      const target = wantBack ? false : true;
      if(!!hit.soldOut===target) return { desc:`「${hit.nm}」已经是${target?'沽清':'有售'}了`, readOnly:true, run:async()=>`「${hit.nm}」状态未变。` };
      return { desc:`把「${hit.nm}」标记为 ${target?'沽清（卖完）':'恢复供应'}`,
        run:async()=>{ await MKR.db.put('menu',{id:hit.id, soldOut:target}); await MKR.audit.log({action:'menu.soldout', desc:`${target?'Marked sold out':'Restocked'}: ${hit.nm} · AI`}); return `✅ 已把「${hit.nm}」标记为${target?'沽清':'恢复供应'}。`; } };
    },
    // 发优惠券
    async function(t){
      const low=t.toLowerCase();
      if(!/(优惠券|发券|coupon|折扣|discount)/.test(low)) return null;
      let type=null, value=null;
      const pm = low.match(/(\d+)\s*%/) || low.match(/(\d+)\s*percent/);
      if(pm){ type='pct'; value=+pm[1]; }
      if(!type){ const am = low.match(/减\s*(\d+)/) || low.match(/[$￥]\s*(\d+)/) || low.match(/(\d+)\s*(元|块|dollar)/); if(am){ type='amt'; value=+am[1]; } }
      if(!type || !value) return null;
      return { desc:`发 1 张${type==='pct'?value+'% 折扣':'减 $'+value}的公开优惠券`,
        run:async()=>{ const made=await MKR.membership.issueCoupon({type, value, count:1}); return `🎟️ 已发券，码：<b>${made[0].code}</b>（${type==='pct'?value+'% off':'$'+value+' off'}）。`; } };
    },
    // 加排队
    async function(t){
      const low=t.toLowerCase();
      if(!/(排队|取号|候位|waitlist|queue)/.test(low)) return null;
      const party = numOf(/(\d+)\s*(人|位|pax|people|ppl)/, low) || 2;
      const name = t.replace(/(排队|取号|候位|waitlist|queue|加入|帮我|把|一位|客人)/g,'').replace(/(\d+)\s*(人|位|pax|people|ppl)/g,'').trim();
      return { desc:`把${name?'「'+name+'」':'一位客人'}（${party} 人）加入排队`,
        run:async()=>{ const today=U.todayISO(); const all=await MKR.db.getAll('waitlist'); const n=all.filter(q=>dayOf(q.createdAt)===today).reduce((mx,q)=>Math.max(mx,q.num||0),0)+1; await MKR.db.put('waitlist',{num:n, name, partySize:party, status:'waiting', kitchenId:kid()}); return `⏳ 已加入排队，号码 <b>#${n}</b>。`; } };
    },
    // 加预订
    async function(t){
      const low=t.toLowerCase();
      if(!/(预订|订位|订桌|book|reserv)/.test(low)) return null;
      const party = numOf(/(\d+)\s*(人|位|pax|people|ppl)/, low) || 2;
      let date=U.todayISO(), dateLabel='今天';
      if(/明天|tomorrow/.test(low)){ date=new Date(Date.now()+864e5).toISOString().slice(0,10); dateLabel=date; }
      else if(/后天/.test(low)){ date=new Date(Date.now()+2*864e5).toISOString().slice(0,10); dateLabel=date; }
      let time=''; const tm=low.match(/(\d{1,2})\s*[:点]\s*(\d{0,2})/); if(tm){ time=String(+tm[1]).padStart(2,'0')+':'+(tm[2]?tm[2].padStart(2,'0'):'00'); }
      const name = t.replace(/(预订|订位|订桌|book a table|book|reservation|reserve|帮我|明天|后天|今天|tomorrow|today)/gi,'').replace(/(\d+)\s*(人|位|pax|people|ppl)/g,'').replace(/(\d{1,2})\s*[:点]\s*(\d{0,2})/g,'').trim();
      return { desc:`新建预订：${name||'客人'} · ${dateLabel} ${time||'(时间未填)'} · ${party} 人`,
        run:async()=>{ await MKR.db.put('reservations',{name:name||'客人', partySize:party, date, time, status:'booked', kitchenId:kid()}); await MKR.audit.log({action:'booking.create', desc:`New booking · ${name||'客人'} · AI`}); return `📅 预订已建：${name||'客人'} · ${dateLabel} ${time} · ${party} 人。`; } };
    },
    // 日报 / 周报 / 总结 (read-only)
    async function(t){
      const low=t.toLowerCase();
      if(!/(日报|周报|总结|汇报|summary|生意怎么|怎么样|今天.*如何|today.*going)/.test(low)) return null;
      return { desc:'生成今日经营总结（只读）', readOnly:true, run:async()=> await dailySummary() };
    },
    // 发邮件 (needs send-email function deployed; degrades gracefully)
    async function(t){
      const em = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      if(!em || !/(邮件|email|发信|mail|验证)/i.test(t)) return null;
      const to = em[0];
      const subject = /验证|verify/i.test(t) ? '邮箱验证 · My Kitchen' : 'My Kitchen 通知';
      const body = t.replace(em[0],'').replace(/(发邮件|发信|email|mail|给|to)/gi,'').trim() || '这是一封来自 My Kitchen 全能助手的测试邮件。';
      return { desc:`给 <b>${U.esc(to)}</b> 发一封邮件（${U.esc(subject)}）`,
        run:async()=>{ if(!MKR.email||!MKR.email.send) return '✉️ 发信功能尚未启用（需部署 send-email 边缘函数）。'; const r=await MKR.email.send({to, subject, html:`<p>${U.esc(body)}</p>`}); return r&&r.ok ? `✉️ 已发送到 ${U.esc(to)}。` : `✉️ 发送失败：${U.esc((r&&r.error)||'未知错误（多半是 send-email 还没部署）')}。`; } };
    },
  ];

  async function detect(text){
    for(const skill of SKILLS){ try{ const a=await skill(text); if(a) return a; }catch(e){} }
    return null;
  }

  // ---------- chat UI ----------
  function bubble(role, html){
    const m=U.el(`<div class="aa-msg ${role}">${html}</div>`); logEl.appendChild(m); logEl.scrollTop=logEl.scrollHeight; return m;
  }
  function intro(){
    return `我是你的全能助手，把事情交给我就行：<b>查营业额 / 排队 / 沽清 / 发优惠券 / 加预订 / 起草总结</b>，或者直接问我任何问题。<br>
      <span class="faint" style="font-size:12px">例如：「今天生意怎么样」「把 Pho 沽清」「发一张 10% 优惠券」「明天 7 点 4 人 张先生 订位」「发邮件验证 a@b.com」</span>`;
  }
  const CHIPS = ['今天生意怎么样','把 Pho 沽清','发一张 10% 优惠券','明天19点4人订位','生成今日总结'];

  async function handle(text){
    text=String(text||'').trim(); if(!text) return;
    bubble('user', U.esc(text));
    const thinking = bubble('bot', '<span class="ai-dots"><i></i><i></i><i></i></span>');
    const action = await detect(text);
    if(!action){
      // not an action → answer (data lookup / KB / LLM)
      let html='…'; try{ html = await MKR.assistant.answer(text); }catch(e){ html='抱歉，我没能处理这个。'; }
      thinking.innerHTML = html;
      thinking.querySelectorAll('[data-jump]').forEach(a=>a.onclick=(e)=>{ e.preventDefault(); location.hash=a.dataset.jump; });
      logEl.scrollTop=logEl.scrollHeight; return;
    }
    if(action.readOnly || mode()==='auto'){
      try{ const res=await action.run(); thinking.innerHTML = res; }
      catch(e){ thinking.innerHTML='执行出错了，请稍后再试。'; }
      logEl.scrollTop=logEl.scrollHeight; return;
    }
    // manual mode → confirmation card
    thinking.innerHTML = `<div class="aa-confirm"><div>🤔 ${action.desc}？</div>
      <div class="row gap8 mt8"><button class="btn btn-green btn-sm" data-ok>确认执行</button><button class="btn btn-ghost btn-sm" data-no>取消</button></div></div>`;
    thinking.querySelector('[data-ok]').onclick=async()=>{
      thinking.innerHTML='<span class="ai-dots"><i></i><i></i><i></i></span>';
      try{ const res=await action.run(); thinking.innerHTML=res; }catch(e){ thinking.innerHTML='执行出错了。'; }
      logEl.scrollTop=logEl.scrollHeight;
    };
    thinking.querySelector('[data-no]').onclick=()=>{ thinking.innerHTML='好的，已取消。'; };
  }

  async function render(c){
    c.innerHTML = `
      <div class="ai-admin">
        <div class="aa-head">
          <div class="row center gap8"><div class="aa-orb">✨</div>
            <div><h2 style="margin:0;font-size:20px">全能助手</h2><div class="faint" id="aaMode" style="font-size:12px">${mode()==='auto'?'自动式':'手动式'} · AI 驱动</div></div></div>
          <button class="btn btn-ghost btn-sm" id="aaToggle">${mode()==='auto'?'🤖 自动模式':'✋ 手动模式'}</button>
        </div>
        <div class="aa-log" id="aaLog"></div>
        <div class="aa-chips" id="aaChips">${CHIPS.map(q=>`<button class="aa-chip" data-q="${U.esc(q)}">${U.esc(q)}</button>`).join('')}</div>
        <form class="aa-input" id="aaForm"><input class="input" id="aaInput" placeholder="把事情交给我…" autocomplete="off"><button class="btn btn-dark" type="submit" aria-label="发送">➤</button></form>
      </div>`;
    logEl = U.qs('#aaLog',c);
    bubble('bot', intro());
    U.qs('#aaToggle',c).onclick=()=>{ setMode(mode()==='auto'?'manual':'auto'); render(c); };
    U.qsa('.aa-chip',c).forEach(b=>b.onclick=()=>handle(b.dataset.q));
    U.qs('#aaForm',c).onsubmit=(e)=>{ e.preventDefault(); const i=U.qs('#aaInput',c); const v=i.value; i.value=''; handle(v); };
    setTimeout(()=>{ const i=U.qs('#aaInput',c); if(i) i.focus(); },50);
  }

  MKR.views.admin = { render };
})();
