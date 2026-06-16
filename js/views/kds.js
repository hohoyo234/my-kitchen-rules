/* ===== Kitchen Display System (KDS) ===== */
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
          <div><h2>Kitchen Display (KDS)</h2><p>Live large tickets · tap when done · instant front/back sync</p></div>
          <span class="pill ghost" id="kcount">—</span>
        </div>
        <div id="urgeBar"></div>
        <div class="kds-grid" id="kgrid"></div>`;

      // Urge banner: customer nudges from the last 20 minutes, unhandled
      async function drawUrge(){
        const bar=U.qs('#urgeBar',container); if(!bar) return;
        const fbs=(await MKR.db.getAll('customer_feedback')).filter(f=>f.type==='urge' && !f.handled && (Date.now()-(f.ts||0)<20*60000));
        if(!fbs.length){ bar.innerHTML=''; return; }
        const tables=[...new Set(fbs.map(f=>f.table))];
        bar.innerHTML=`<div class="alert red urge-flash" style="margin-bottom:16px"><span>🔔</span>
          <div class="grow"><b>Customer urging!</b> Tables: ${tables.map(t=>'<b>'+U.esc(t)+'</b>').join(' · ')}</div>
          <button class="btn btn-ghost btn-sm" id="clrUrge">Handled</button></div>`;
        U.qs('#clrUrge',container).onclick=async()=>{ for(const f of fbs) await MKR.db.put('customer_feedback',{id:f.id, handled:true}); drawUrge(); };
      }

      async function draw(){
        await drawUrge();
        const grid = U.qs('#kgrid',container); if(!grid) return;
        const orders = (await MKR.db.getAll('orders')).filter(o=>o.status==='cooking').sort((a,b)=>a.createdAt-b.createdAt);
        U.qs('#kcount',container).textContent = orders.length+' to serve';
        if(!orders.length){ grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="em">🍽️</div><p>No pending orders — kitchen's clear ✨</p></div>`; return; }
        grid.innerHTML = orders.map(o=>{
          const mins = U.mins(o.createdAt || o.updatedAt || o.ts || Date.now());
          const cls = mins>=12?'late':mins>=6?'warn':'';
          return `<div class="ticket ${cls}">
            <div class="ticket-head"><span class="t">#${o.id.slice(-4)}${o.table?' · table '+o.table:''}</span><span class="timer">${mins}′</span></div>
            <div class="ticket-body">
              ${o.items.map(it=>`<div class="ticket-line"><span><span class="q">${it.qty}×</span>${U.esc(it.nm)}${it.note?`<span class="note">📝 ${U.esc(it.note)}</span>`:''}</span></div>`).join('')}
              <button class="btn btn-dark btn-block mt12" data-done="${o.id}">✓ Mark served</button>
            </div>
          </div>`;
        }).join('');
        U.qsa('[data-done]',grid).forEach(b=>b.onclick=async()=>{
          await MKR.db.put('orders',{id:b.dataset.done, status:'done'});
          U.toast('Served','green'); draw();
        });
      }
      await draw();
      // Realtime: orders + customer urges
      unsub = MKR.db.on('orders', ()=>draw());
      unsub2 = MKR.db.on('customer_feedback', ()=>drawUrge());
      // Timer refresh
      timer = setInterval(draw, 5000);
    }
  };
})();
