/* ===== 后厨数字传菜看板 KDS ===== */
window.MKR = window.MKR || {}; MKR.views = MKR.views || {};
(function(){
  const U = MKR.util;
  let unsub=null, timer=null;

  function cleanup(){ if(unsub){unsub();unsub=null;} if(timer){clearInterval(timer);timer=null;} }

  MKR.views.kds = {
    async render(container){
      cleanup();
      container.innerHTML = `
        <div class="section-head">
          <div><h2>后厨传菜看板 KDS</h2><p>大字方块实时显示订单 · 做完点一下消除 · 前后台秒级同步</p></div>
          <span class="pill ghost" id="kcount">—</span>
        </div>
        <div class="kds-grid" id="kgrid"></div>`;

      async function draw(){
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
      // 实时：订单变化（本标签）+ 跨标签 storage 事件
      unsub = MKR.db.on('orders', ()=>draw());
      // 计时器刷新
      timer = setInterval(draw, 5000);
    }
  };
})();
