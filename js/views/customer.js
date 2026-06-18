/* ===== Customer side: scan-to-order at the table (no sign-up) =====
   Public page, no login needed. Uses the anon client to read the menu and
   place orders (read menu / insert orders only).
   Orders flow live into the kitchen KDS.
*/
window.MKR = window.MKR || {};
(function(){
  const U = ()=>MKR.util;
  let cart = [];   // {id,nm,price,qty,note}

  async function render(root, table){
    table = decodeURIComponent(table||'').trim() || '—';
    cart = [];
    root.innerHTML = `<div class="cust-wrap"><div class="empty"><div class="em">🍽️</div><p>Loading menu…</p></div></div>`;

    let menu = [];
    if(MKR.supa && MKR.supa.client){
      const { data, error } = await MKR.supa.client.from('menu').select('id,data');
      if(!error && data) menu = data.map(r=>({id:r.id, ...r.data})).filter(m=>m.nm);
    }
    if(!menu.length){
      root.innerHTML = `<div class="cust-wrap"><div class="empty"><div class="em">😕</div><p>Menu can't be loaded right now</p><p class="faint" style="font-size:13px">Please call a server or try again shortly</p></div></div>`;
      return;
    }
    const cats = [...new Set(menu.map(m=>m.cat||'Other'))];

    function draw(activeCat){
      activeCat = activeCat || 'All';
      const items = menu.filter(m=>activeCat==='All' || (m.cat||'Other')===activeCat);
      root.innerHTML = `
        <div class="cust-wrap">
          <header class="cust-head">
            <div><div class="cust-brand">My Kitchen</div><div class="cust-table">🪑 Table ${esc(table)} · self-order</div></div>
            <a class="btn btn-ghost btn-sm" href="#/points">⭐ My rewards</a>
          </header>
          <div class="cust-cats">
            ${['All',...cats].map(c=>`<button class="${c===activeCat?'active':''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}
          </div>
          <div class="cust-menu">
            ${items.map(m=>`<div class="cust-item${m.soldOut?' is-soldout':''}" data-id="${m.id}">
              ${m.img?`<img class="ci-img" src="${m.img}" alt="${esc(m.nm)}">`:''}
              <div class="ci-info"><b>${esc(m.nm)}</b><span class="ci-price">${m.soldOut?'Sold out':U().money(m.price)}</span></div>
              ${m.soldOut?'<span class="ci-sold">Sold out</span>':`<button class="ci-add" data-add="${m.id}">＋</button>`}
            </div>`).join('')}
          </div>
          <div class="cust-bar" id="custBar"></div>
        </div>`;
      // Categories
      U().qsa('.cust-cats button',root).forEach(b=>b.onclick=()=>draw(b.dataset.c));
      // Add item
      U().qsa('[data-add]',root).forEach(b=>b.onclick=()=>{ addItem(menu.find(m=>m.id===b.dataset.add)); });
      drawBar();
    }

    function addItem(m){ if(!m) return; const l=cart.find(x=>x.id===m.id&&!x.note); if(l) l.qty++; else cart.push({id:m.id,nm:m.nm,price:m.price,qty:1,note:''}); drawBar(); flash(); }
    function total(){ return cart.reduce((s,l)=>s+l.price*l.qty,0); }
    function count(){ return cart.reduce((s,l)=>s+l.qty,0); }
    function drawBar(){
      const bar=U().qs('#custBar',root); if(!bar) return;
      if(!cart.length){ bar.classList.remove('show'); bar.innerHTML=''; return; }
      bar.classList.add('show');
      bar.innerHTML = `<button class="cust-cart-btn" id="openCart"><span>🛒 ${count()} items</span><span>${U().money(total())}</span><span class="go">Order →</span></button>`;
      U().qs('#openCart',root).onclick=openCart;
    }
    function flash(){ const bar=U().qs('#custBar',root); if(bar){ bar.style.transform='scale(1.03)'; setTimeout(()=>bar.style.transform='',120);} }

    function openCart(){
      const wrap=U().el(`<div>
        <div class="cust-lines">${cart.map((l,i)=>`
          <div class="cust-line"><div class="grow"><b>${esc(l.nm)}</b>${l.note?`<div class="ci-note">📝 ${esc(l.note)}</div>`:''}<div class="ci-note add-note" data-note="${i}">${l.note?'Edit note':'+ Add note (e.g. no onion)'}</div></div>
            <div class="qty"><button data-dec="${i}">−</button><b>${l.qty}</b><button data-inc="${i}">＋</button></div></div>`).join('')}</div>
        <div class="cart-total" style="margin-top:12px"><span>Total</span><span class="v">${U().money(total())}</span></div>
      </div>`);
      const m=U().modal(`Table ${esc(table)} · confirm order`, wrap, {actions:[
        {label:'Send to kitchen', class:'btn-green', onClick:async(close)=>{ close(); await placeOrder(); }}
      ]});
      U().qsa('[data-inc]',wrap).forEach(b=>b.onclick=()=>{ cart[b.dataset.inc].qty++; m.close(); openCart(); drawBar(); });
      U().qsa('[data-dec]',wrap).forEach(b=>b.onclick=()=>{ const i=b.dataset.dec; cart[i].qty--; if(cart[i].qty<=0) cart.splice(i,1); m.close(); if(cart.length) openCart(); drawBar(); });
      U().qsa('[data-note]',wrap).forEach(b=>b.onclick=()=>{ const i=+b.dataset.note; const v=prompt('Note (e.g. no onion / not spicy / no ice)', cart[i].note||''); if(v!=null){ cart[i].note=v.trim(); m.close(); openCart(); } });
    }

    async function placeOrder(){
      const order={ id:U().uid('ord'), items:cart.map(l=>({...l})), total:total(), subtotal:total(),
        table:String(table), source:'customer', status:'cooking', paid:false, payStatus:'unpaid',
        createdAt:Date.now(), updatedAt:Date.now(), ts:Date.now() };
      let ok=false;
      try{ const {error}=await MKR.supa.client.from('orders').insert({id:order.id, data:order, updated_at:new Date().toISOString()}); ok=!error; }catch(e){}
      done(ok, order);
    }

    async function fb(payload){
      try{ await MKR.supa.client.from('customer_feedback').insert({id:U().uid('fb'), data:{...payload, table:String(table), ts:Date.now()}, updated_at:new Date().toISOString()}); return true; }catch(e){ return false; }
    }

    function done(ok, order){
      root.innerHTML = `<div class="cust-wrap"><div class="cust-done">
        <div class="em">${ok?'✅':'⚠️'}</div>
        <h2>${ok?'Order placed — cooking now!':'Order failed'}</h2>
        ${ok?`<p class="muted">Table ${esc(table)} · ${order.items.reduce((s,l)=>s+l.qty,0)} items · ${U().money(order.total)}</p>
          <div class="card" style="padding:14px 18px;text-align:left;margin:16px auto;max-width:340px">
            ${order.items.map(l=>`<div class="cust-line" style="border:none;padding:6px 0"><span>${l.qty}× ${esc(l.nm)}${l.note?' <span class="faint">('+esc(l.note)+')</span>':''}</span></div>`).join('')}
          </div>
          <div class="row gap8" style="max-width:340px;margin:0 auto 18px">
            <button class="btn btn-accent grow" id="urge">🔔 Hurry up</button>
            <button class="btn btn-ghost grow" id="again">Order more</button>
          </div>
          <div class="card" id="rateBox" style="padding:18px;max-width:340px;margin:0 auto">
            <b style="font-size:15px">How was your meal?</b>
            <div class="stars" id="stars" style="font-size:34px;margin-top:10px;letter-spacing:6px">
              ${[1,2,3,4,5].map(n=>`<span data-star="${n}" style="cursor:pointer;opacity:.35">★</span>`).join('')}
            </div>
          </div>`
        :`<p class="muted">Network issue — please call a server or retry</p><button class="btn btn-dark" id="again">Retry</button>`}
      </div></div>`;
      const a=U().qs('#again',root); if(a) a.onclick=()=>{ cart=[]; draw('All'); };
      const urgeBtn=U().qs('#urge',root);
      if(urgeBtn) urgeBtn.onclick=async()=>{ urgeBtn.disabled=true; urgeBtn.textContent='Kitchen notified ✓'; await fb({type:'urge', orderId:order&&order.id}); };
      // Star rating
      U().qsa('#stars [data-star]',root).forEach(s=>s.onclick=()=>rate(+s.dataset.star));
    }

    function rate(n){
      U().qsa('#stars [data-star]',root).forEach(s=>s.style.opacity = (+s.dataset.star<=n)?'1':'.35');
      const box=U().qs('#rateBox',root); if(!box) return;
      if(n>=4){
        box.innerHTML = `<b style="font-size:15px">Thanks for the great review! 🎉</b><p class="muted" style="font-size:13px;margin:8px 0 12px">Would you mind leaving us a review on Google?</p>
          <a class="btn btn-dark btn-block" target="_blank" href="https://www.google.com/search?q=my+kitchen+restaurant+review">Leave a Google review ↗</a>`;
        fb({type:'review', rating:n});
      } else {
        box.innerHTML = `<b style="font-size:15px">Sorry we fell short 🙏</b><p class="muted" style="font-size:13px;margin:8px 0 10px">Tell us what we can improve? (only the venue sees this)</p>
          <textarea class="input" id="cmt" placeholder="e.g. slow service / too salty…" style="min-height:80px"></textarea>
          <button class="btn btn-dark btn-block mt12" id="sendCmt">Send feedback</button>`;
        U().qs('#sendCmt',box).onclick=async()=>{
          await fb({type:'review', rating:n, comment:(U().qs('#cmt',box).value||'').trim()});
          box.innerHTML = `<b style="font-size:15px">Got it — thank you! 🙏</b><p class="muted" style="font-size:13px;margin-top:6px">We'll work on it right away.</p>`;
        };
      }
    }

    function esc(s){ return U().esc(s); }
    draw('All');
  }

  MKR.customer = { render };
})();
