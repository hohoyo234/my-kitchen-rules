/* ===== 后厨数字传菜看板 KDS ===== */
window.MKR = window.MKR || {}; MKR.views = MKR.views || {};
(function(){
  const U = MKR.util;
  let unsub=null, unsub2=null, timer=null;

  function cleanup(){ if(unsub){unsub();unsub=null;} if(unsub2){unsub2();unsub2=null;} if(timer){clearInterval(timer);timer=null;} }

  MKR.views.kds = {
    async render(container){
      cleanup();
      container.innerHTML = `
        <div class="section-head">
          <div><h2>后厨传菜看板 KDS</h2><p>大字方块实时显示订单 · 做完点一下消除 · 前后台秒级同步</p></div>
          <span class="pill ghost" id="kcount">—</span>
        </div>
        <div id="urgeBar"></div>
        <div class="kds-grid" id="kgrid"></div>`;

      // 催菜红条:最近 20 分钟未处理的催菜
      async function drawUrge(){
        const bar=U.qs('#urgeBar',container); if(!bar) return;
        const fbs=(await MKR.db.getAll('customer_feedback')).filter(f=>f.type==='urge' && !f.handled && (Date.now()-(f.ts||0)<20*60000));
        if(!fbs.length){ bar.innerHTML=''; return; }
        const tables=[...new Set(fbs.map(f=>f.table))];
        bar.innerHTML=`<div class="alert red urge-flash" style="margin-bottom:16px"><span>🔔</span>
          <div class="grow"><b>顾客催菜!</b> 桌号:${tables.map(t=>'<b>'+U.esc(t)+'</b>').join(' · ')}</div>
          <button class="btn btn-ghost btn-sm" id="clrUrge">已处理</button></div>`;
        U.qs('#clrUrge',container).onclick=async()=>{ for(const f of fbs) await MKR.db.put('customer_feedback',{id:f.id, handled:true}); drawUrge(); };
      }

      async function draw(){
        await drawUrge();
        const grid = U.qs('#kgrid',container); if(!grid) return;
        const orders = (await MKR.db.getAll('orders')).filter(o=>o.status==='cooking').sort((a,b)=>a.createdAt-b.createdAt);
        U.qs('#kcount',container).textContent = orders.length+' 单待出餐';
        if(!orders.length){ grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="em">🍽️</div><p>暂无待出餐订单，后厨清爽 ✨</p></div>`; return; }
        grid.innerHTML = orders.map(o=>{
          const mins = U.mins(o.createdAt || o.updatedAt || o.ts || Date.now());
          const cls = mins>=12?'late':mins>=6?'warn':'';
          return `<div class="ticket ${cls}">
            <div class="ticket-head"><span class="t">#${o.id.slice(-4)}${o.table?' · 桌'+o.table:''}</span><span class="timer">${mins}′</span></div>
            <div class="ticket-body">
              ${o.items.map(it=>`<div class="ticket-line"><span><span class="q">${it.qty}×</span>${it.nm}${it.note?`<span class="note">📝 ${U.esc(it.note)}</span>`:''}</span></div>`).join('')}
              <button class="btn btn-dark btn-block mt12" data-done="${o.id}">✓ 完成出餐</button>
            </div>
          </div>`;
        }).join('');
        U.qsa('[data-done]',grid).forEach(b=>b.onclick=async()=>{
          await MKR.db.put('orders',{id:b.dataset.done, status:'done'});
          U.toast('已出餐','green'); draw();
        });
      }
      await draw();
      // 实时：订单 + 顾客催菜
      unsub = MKR.db.on('orders', ()=>draw());
      unsub2 = MKR.db.on('customer_feedback', ()=>drawUrge());
      // 计时器刷新
      timer = setInterval(draw, 5000);
    }
  };
})();
