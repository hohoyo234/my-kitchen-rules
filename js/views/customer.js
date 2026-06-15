/* ===== 顾客端:桌码扫码自助点餐(免注册)=====
   公开页面,不需要登录。直接用 anon 客户端读菜单 + 下单(只读 menu / 只插 orders)。
   下单后实时进后厨 KDS。
*/
window.MKR = window.MKR || {};
(function(){
  const U = ()=>MKR.util;
  let cart = [];   // {id,nm,price,qty,note}

  async function render(root, table){
    table = decodeURIComponent(table||'').trim() || '—';
    cart = [];
    root.innerHTML = `<div class="cust-wrap"><div class="empty"><div class="em">🍽️</div><p>正在加载菜单…</p></div></div>`;

    let menu = [];
    if(MKR.supa && MKR.supa.client){
      const { data, error } = await MKR.supa.client.from('menu').select('id,data');
      if(!error && data) menu = data.map(r=>({id:r.id, ...r.data})).filter(m=>m.nm);
    }
    if(!menu.length){
      root.innerHTML = `<div class="cust-wrap"><div class="empty"><div class="em">😕</div><p>菜单暂时无法加载</p><p class="faint" style="font-size:13px">请呼叫服务员或稍后再试</p></div></div>`;
      return;
    }
    const cats = [...new Set(menu.map(m=>m.cat||'其它'))];

    function draw(activeCat){
      activeCat = activeCat || '全部';
      const items = menu.filter(m=>activeCat==='全部' || (m.cat||'其它')===activeCat);
      root.innerHTML = `
        <div class="cust-wrap">
          <header class="cust-head">
            <div><div class="cust-brand">My Kitchen</div><div class="cust-table">🪑 ${esc(table)} 桌 · 自助点餐</div></div>
          </header>
          <div class="cust-cats">
            ${['全部',...cats].map(c=>`<button class="${c===activeCat?'active':''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}
          </div>
          <div class="cust-menu">
            ${items.map(m=>`<div class="cust-item" data-id="${m.id}">
              <div class="ci-info"><b>${esc(m.nm)}</b><span class="ci-price">${U().money(m.price)}</span></div>
              <button class="ci-add" data-add="${m.id}">＋</button>
            </div>`).join('')}
          </div>
          <div class="cust-bar" id="custBar"></div>
        </div>`;
      // 分类
      U().qsa('.cust-cats button',root).forEach(b=>b.onclick=()=>draw(b.dataset.c));
      // 加菜
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
      bar.innerHTML = `<button class="cust-cart-btn" id="openCart"><span>🛒 ${count()} 件</span><span>${U().money(total())}</span><span class="go">下单 →</span></button>`;
      U().qs('#openCart',root).onclick=openCart;
    }
    function flash(){ const bar=U().qs('#custBar',root); if(bar){ bar.style.transform='scale(1.03)'; setTimeout(()=>bar.style.transform='',120);} }

    function openCart(){
      const wrap=U().el(`<div>
        <div class="cust-lines">${cart.map((l,i)=>`
          <div class="cust-line"><div class="grow"><b>${esc(l.nm)}</b>${l.note?`<div class="ci-note">📝 ${esc(l.note)}</div>`:''}<div class="ci-note add-note" data-note="${i}">${l.note?'改备注':'+ 加备注(如去葱)'}</div></div>
            <div class="qty"><button data-dec="${i}">−</button><b>${l.qty}</b><button data-inc="${i}">＋</button></div></div>`).join('')}</div>
        <div class="cart-total" style="margin-top:12px"><span>合计</span><span class="v">${U().money(total())}</span></div>
      </div>`);
      const m=U().modal(`${esc(table)} 桌 · 确认下单`, wrap, {actions:[
        {label:'提交给后厨', class:'btn-green', onClick:async(close)=>{ close(); await placeOrder(); }}
      ]});
      U().qsa('[data-inc]',wrap).forEach(b=>b.onclick=()=>{ cart[b.dataset.inc].qty++; m.close(); openCart(); drawBar(); });
      U().qsa('[data-dec]',wrap).forEach(b=>b.onclick=()=>{ const i=b.dataset.dec; cart[i].qty--; if(cart[i].qty<=0) cart.splice(i,1); m.close(); if(cart.length) openCart(); drawBar(); });
      U().qsa('[data-note]',wrap).forEach(b=>b.onclick=()=>{ const i=+b.dataset.note; const v=prompt('备注(如:去葱 / 不要辣 / 走冰)', cart[i].note||''); if(v!=null){ cart[i].note=v.trim(); m.close(); openCart(); } });
    }

    async function placeOrder(){
      const order={ id:U().uid('ord'), items:cart.map(l=>({...l})), total:total(), subtotal:total(),
        table:String(table), source:'customer', status:'cooking', paid:false, payStatus:'unpaid',
        createdAt:Date.now(), updatedAt:Date.now(), ts:Date.now() };
      let ok=false;
      try{ const {error}=await MKR.supa.client.from('orders').insert({id:order.id, data:order, updated_at:new Date().toISOString()}); ok=!error; }catch(e){}
      done(ok, order);
    }

    function done(ok, order){
      root.innerHTML = `<div class="cust-wrap"><div class="cust-done">
        <div class="em">${ok?'✅':'⚠️'}</div>
        <h2>${ok?'已下单,后厨马上做!':'下单失败'}</h2>
        ${ok?`<p class="muted">${esc(table)} 桌 · ${order.items.reduce((s,l)=>s+l.qty,0)} 件 · ${U().money(order.total)}</p>
          <div class="card" style="padding:14px 18px;text-align:left;margin:16px auto;max-width:340px">
            ${order.items.map(l=>`<div class="cust-line" style="border:none;padding:6px 0"><span>${l.qty}× ${esc(l.nm)}${l.note?' <span class="faint">('+esc(l.note)+')</span>':''}</span></div>`).join('')}
          </div>
          <button class="btn btn-dark" id="again">再点一份</button>`
        :`<p class="muted">网络问题,请呼叫服务员或重试</p><button class="btn btn-dark" id="again">重试</button>`}
      </div></div>`;
      const a=U().qs('#again',root); if(a) a.onclick=()=>{ cart=[]; draw('全部'); };
    }

    function esc(s){ return U().esc(s); }
    draw('全部');
  }

  MKR.customer = { render };
})();
