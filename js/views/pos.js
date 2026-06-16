/* ===== POS: ordering / fast cash counting / blind drop ===== */
window.MKR = window.MKR || {}; MKR.views = MKR.views || {};
(function(){
  const U = MKR.util;
  let cart = [];          // {id,nm,price,qty,note}
  let discountPct = 0;
  let menu = [];

  const DENOMS = [100,50,20,10,5,2,1,0.5];

  function subtotal(){ return cart.reduce((s,l)=>s+l.price*l.qty,0); }
  function total(){ return subtotal()*(1-discountPct/100); }

  function isToday(ts){ return new Date(ts).toISOString().slice(0,10)===U.todayISO(); }

  MKR.views.pos = {
    async render(container){
      menu = await MKR.db.getAll('menu');
      const cats = [...new Set(menu.map(m=>m.cat))];
      // Restore draft
      const d = MKR.db.draft.load('pos-cart');
      if(d && d.data && d.data.length && !cart.length){
        cart = d.data;
        U.toast('Restored your last unfinished order','amber');
      }

      container.innerHTML = `
        <div class="section-head">
          <div><h2>POS / Ordering</h2><p>Fast ordering · change & receipts · closing blind drop</p></div>
          <div class="row gap8 wrap">
            ${(MKR.features && MKR.features.can('blinddrop', MKR.auth.current().role))?'<button class="btn btn-ghost btn-sm" id="blindBtn">🥁 Blind drop</button>':''}
            <button class="btn btn-ghost btn-sm" id="ordersBtn">📋 Today\'s orders</button>
          </div>
        </div>
        <div class="pos">
          <div>
            <div class="cat-tabs" id="cats">
              <button class="active" data-c="*">All</button>
              ${cats.map(c=>`<button data-c="${U.esc(c)}">${U.esc(c)}</button>`).join('')}
            </div>
            <div class="menu-grid" id="menuGrid"></div>
          </div>
          <div class="card" style="padding:18px">
            <div class="cart">
              <div class="section-title">Current order <span id="tableWrap"><input class="input" id="tableNo" placeholder="Table" style="height:36px;width:84px;font-size:13px"></span></div>
              <div class="cart-lines" id="cartLines"></div>
              <div class="cart-total"><span>Subtotal</span><span id="sub">$0.00</span></div>
              <div class="cart-total" id="discRow" style="display:none;color:var(--accent)"><span>Discount</span><span id="discAmt"></span></div>
              <div class="cart-total"><span>Total due</span><span class="v" id="tot">$0.00</span></div>
              <div class="col gap8">
                <button class="btn btn-dark btn-block" id="payBtn">💳 Pay & send</button>
                <div class="row gap8">
                  <button class="btn btn-ghost btn-sm grow" id="discBtn">Discount</button>
                  <button class="btn btn-ghost btn-sm grow" id="clearBtn">Clear</button>
                </div>
              </div>
              <div class="disclaimer mt12"><span>🔒</span>Cancels, discounts and refunds are all written to the tamper-proof audit log.</div>
            </div>
          </div>
        </div>`;

      const grid = U.qs('#menuGrid', container);
      function drawMenu(cat){
        const items = menu.filter(m=>cat==='*'||m.cat===cat);
        if(!items.length){ grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="em">🍽️</div><p>No items yet — add dishes in Menu & Items</p></div>`; return; }
        grid.innerHTML = items.map(m=>`
          <button class="menu-item${m.img?' has-img':''}" data-id="${m.id}">
            ${m.img?`<img class="mi-img" src="${m.img}" alt="${U.esc(m.nm)}">`:''}
            <span class="nm">${U.esc(m.nm)}</span><span class="pr">${U.money(m.price)}</span>
          </button>`).join('');
        U.qsa('.menu-item',grid).forEach(b=> b.onclick=()=>addItem(b.dataset.id));
      }
      U.qsa('#cats button',container).forEach(b=> b.onclick=()=>{
        U.qsa('#cats button',container).forEach(x=>x.classList.remove('active'));
        b.classList.add('active'); drawMenu(b.dataset.c);
      });
      drawMenu('*');

      function addItem(id){
        const m = menu.find(x=>x.id===id); if(!m) return;
        const line = cart.find(l=>l.id===id && !l.note);
        if(line) line.qty++; else cart.push({id:m.id, nm:m.nm, price:m.price, qty:1, note:''});
        sync();
      }
      function drawCart(){
        const lines = U.qs('#cartLines',container);
        if(!cart.length){ lines.innerHTML = `<div class="empty" style="padding:24px"><div class="em">🧾</div><p>Tap a dish on the left to start an order</p></div>`; }
        else lines.innerHTML = cart.map((l,i)=>`
          <div class="cart-line">
            <div class="grow"><b>${U.esc(l.nm)}</b>${l.note?`<div class="note" data-note="${i}">📝 ${U.esc(l.note)}</div>`:`<div class="note" data-note="${i}">+ Add note</div>`}</div>
            <div class="qty"><button data-dec="${i}">−</button><b>${l.qty}</b><button data-inc="${i}">+</button></div>
          </div>`).join('');
        U.qsa('[data-inc]',lines).forEach(b=>b.onclick=()=>{ cart[b.dataset.inc].qty++; sync(); });
        U.qsa('[data-dec]',lines).forEach(b=>b.onclick=()=>{ const i=b.dataset.dec; cart[i].qty--; if(cart[i].qty<=0) cart.splice(i,1); sync(); });
        U.qsa('[data-note]',lines).forEach(b=>b.onclick=()=>noteModal(+b.dataset.note));
        U.qs('#sub',container).textContent = U.money(subtotal());
        U.qs('#tot',container).textContent = U.money(total());
        const dr = U.qs('#discRow',container);
        if(discountPct>0){ dr.style.display='flex'; U.qs('#discAmt',container).textContent='−'+U.money(subtotal()*discountPct/100)+` (${discountPct}%)`; }
        else dr.style.display='none';
        U.qs('#payBtn',container).disabled = !cart.length;
      }
      function sync(){
        drawCart();
        MKR.net.setDirty(cart.length>0);
        MKR.db.draft.save('pos-cart', cart);
      }
      function noteModal(i){
        const wrap = U.el(`<div><input class="input" id="nt" placeholder="e.g. no onion, not spicy, no ice" value="${U.esc(cart[i].note)}"></div>`);
        const m = U.modal('Item note · '+cart[i].nm, wrap, {actions:[
          {label:'Save', class:'btn-dark', onClick:(c)=>{ cart[i].note = U.qs('#nt',wrap).value.trim(); sync(); c(); }}
        ]});
        setTimeout(()=>U.qs('#nt',wrap).focus(),50);
      }

      U.qs('#discBtn',container).onclick = ()=>{
        if(!cart.length) return;
        const wrap = U.el(`<div><div class="field"><label>Discount percent %</label><input class="input" id="dp" type="number" min="0" max="100" value="${discountPct}"></div></div>`);
        U.modal('Manual discount', wrap, {actions:[
          {label:'Apply', class:'btn-dark', onClick:async(c)=>{
            discountPct = Math.min(100,Math.max(0,+U.qs('#dp',wrap).value||0));
            if(discountPct>0) await MKR.audit.log({action:'order.discount', desc:`Manual discount ${discountPct}%`, amount:subtotal()*discountPct/100});
            sync(); c();
          }}
        ]});
      };
      U.qs('#clearBtn',container).onclick = async ()=>{
        if(!cart.length) return;
        if(await U.confirm('Clear order','Clear the current order?',{ok:'Clear',danger:true})){
          cart=[]; discountPct=0; MKR.db.draft.clear('pos-cart'); sync();
        }
      };
      U.qs('#payBtn',container).onclick = ()=> payModal(container, drawCart, ()=>{ cart=[]; discountPct=0; MKR.db.draft.clear('pos-cart'); MKR.net.setDirty(false); drawCart(); });
      const _bb=U.qs('#blindBtn',container); if(_bb) _bb.onclick = ()=> blindDrop(container);
      U.qs('#ordersBtn',container).onclick = ()=> ordersModal();

      // Expose to the payment flow
      MKR.views.pos._total = total; MKR.views.pos._cart = ()=>cart;
      drawCart();
    }
  };

  // ---------- Payment (cash change / card) ----------
  function payModal(container, drawCart, onPaid){
    const amount = total();
    const cartSnapshot = cart.map(l=>({...l}));
    const tableNo = (U.qs('#tableNo',container)||{}).value || '';
    let method='cash';
    const wrap = U.el(`
      <div>
        <div class="cart-total"><span>Total due</span><span class="v">${U.money(amount)}</span></div>
        <div class="cat-tabs mt8" id="pm">
          <button class="active" data-m="cash">💵 Cash</button>
          <button data-m="card">💳 Card</button>
        </div>
        <div id="cashArea">
          <div class="field"><label>Cash received</label><input class="input" id="recv" type="number" inputmode="decimal" placeholder="How much did they give"></div>
          <div class="cart-total"><span>Change</span><span class="v" id="change">$0.00</span></div>
        </div>
      </div>`);
    const m = U.modal('Payment', wrap, {actions:[
      {label:'Confirm payment · send to kitchen', class:'btn-green', onClick:async(close)=>{
        const order = {
          items: cartSnapshot, subtotal: cartSnapshot.reduce((s,l)=>s+l.price*l.qty,0),
          total: amount, discountPct, method, table: tableNo,
          status:'cooking', paid:true, payStatus:'paid'
        };
        const saved = await MKR.db.put('orders', order);
        await MKR.audit.log({action:'order.create', desc:`Order #${saved.id.slice(-4)}${tableNo?' · table '+tableNo:''} · ${method==='cash'?'cash':'card'}`, amount:amount, target:saved.id});
        U.toast(`Took ${U.money(amount)} · sent to kitchen`,'green');
        close(); onPaid();
      }}
    ]});
    U.qsa('#pm button',wrap).forEach(b=>b.onclick=()=>{
      U.qsa('#pm button',wrap).forEach(x=>x.classList.remove('active')); b.classList.add('active');
      method=b.dataset.m; U.qs('#cashArea',wrap).style.display = method==='cash'?'block':'none';
    });
    const recv = U.qs('#recv',wrap);
    recv.oninput = ()=>{ const c=(+recv.value||0)-amount; U.qs('#change',wrap).textContent = U.money(Math.max(0,c)); };
    setTimeout(()=>recv.focus(),50);
  }

  // ---------- Closing blind drop ----------
  async function blindDrop(container){
    const orders = await MKR.db.getAll('orders');
    const todayCash = orders.filter(o=>isToday(o.createdAt) && o.method==='cash');
    const expected = todayCash.reduce((s,o)=>s+o.total,0);   // expected total (hidden!)
    const counts = {};
    DENOMS.forEach(d=>counts[d]=0);

    const wrap = U.el(`
      <div>
        <div class="alert info" style="margin-bottom:14px"><span>🙈</span><div>The expected total is hidden. First <b>blind-count the drawer cash</b> and enter it; the system then compares and generates a variance report.</div></div>
        <div class="section-title">Tap note / coin counts</div>
        <div class="cash-grid" id="cg">
          ${DENOMS.map(d=>`
            <div class="denom"><b>${d>=1?'$'+d:(d*100)+'¢'}</b>
              <div class="ct"><button data-m="${d}">−</button><span id="c${String(d).replace('.','_')}">0</span><button data-p="${d}">+</button></div>
            </div>`).join('')}
        </div>
        <div class="total-box"><span>Blind-counted total</span><span class="v" id="counted">$0.00</span></div>
      </div>`);

    function recalc(){
      let tot=0; DENOMS.forEach(d=> tot+=counts[d]*d);
      U.qs('#counted',wrap).textContent = U.money(tot);
      return tot;
    }
    U.qsa('[data-p]',wrap).forEach(b=>b.onclick=()=>{ const d=+b.dataset.p; counts[d]++; U.qs('#c'+String(d).replace('.','_'),wrap).textContent=counts[d]; recalc(); });
    U.qsa('[data-m]',wrap).forEach(b=>b.onclick=()=>{ const d=+b.dataset.m; counts[d]=Math.max(0,counts[d]-1); U.qs('#c'+String(d).replace('.','_'),wrap).textContent=counts[d]; recalc(); });

    U.modal('Closing blind drop', wrap, {actions:[
      {label:'Submit reconciliation', class:'btn-dark', onClick:async(close)=>{
        const counted = recalc();
        const variance = +(counted-expected).toFixed(2);
        const settings = await MKR.db.meta('settings');
        const thr = settings.cashVarianceThreshold||20;
        const rec = await MKR.db.put('reconciliations',{date:U.todayISO(), expected, counted, variance, by: MKR.auth.current().name});
        await MKR.audit.log({action:'pay.blinddrop', desc:`Blind drop · counted ${U.money(counted)} / expected ${U.money(expected)}`, amount:variance});
        // Variance over threshold → red alert for the owner
        if(Math.abs(variance)>thr){
          await MKR.db.put('alerts',{type:'cash', level:'red', title:'Cash blind-drop variance over threshold',
            desc:`Variance ${variance>=0?'+':''}${U.money(variance)} (expected ${U.money(expected)} / counted ${U.money(counted)})`, read:false, ts:Date.now()});
        }
        close();
        // Result
        const ok = Math.abs(variance)<=thr;
        U.modal('Reconciliation result', `
          <div class="alert ${ok?'green':'red'}"><span>${ok?'✅':'⚠️'}</span><div>
            <b>Variance ${variance>=0?'+':''}${U.money(variance)}</b><br>
            Expected ${U.money(expected)} · counted ${U.money(counted)}<br>
            ${ok?'Within tolerance — the variance report has been archived.':'Over the '+U.money(thr)+' threshold — a red alert was pushed to the owner.'}
          </div></div>
          <p class="muted mt12" style="font-size:13px">A tamper-proof reconciliation record was created; the owner can view it.</p>`,
          {actions:[{label:'Got it',class:'btn-dark',onClick:c=>c()}]});
      }}
    ]});
  }

  // ---------- Today's orders (with cancel / refund) ----------
  async function ordersModal(){
    const orders = (await MKR.db.getAll('orders')).filter(o=>isToday(o.createdAt)).sort((a,b)=>b.createdAt-a.createdAt);
    const body = U.el(`<div class="list"></div>`);
    if(!orders.length) body.innerHTML = `<div class="empty"><div class="em">📋</div><p>No orders yet today</p></div>`;
    else body.innerHTML = orders.map(o=>`
      <div class="li">
        <div class="ava">${o.method==='cash'?'💵':'💳'}</div>
        <div class="meta"><b>#${o.id.slice(-4)} · ${U.money(o.total)}${o.table?' · table '+o.table:''}</b>
          <span>${U.fmtTime(o.createdAt)} · ${o.items.length} items · ${({cooking:'Cooking',done:'Done',cancelled:'Cancelled',refunded:'Refunded'})[o.status]||o.status}</span></div>
        ${o.status==='cancelled'||o.status==='refunded'?`<span class="pill danger">${o.status==='refunded'?'Refunded':'Cancelled'}</span>`:
          `<button class="btn btn-ghost btn-sm" data-refund="${o.id}">Refund</button>`}
      </div>`).join('');
    const m = U.modal('Today\'s orders', body);
    U.qsa('[data-refund]',body).forEach(b=>b.onclick=async()=>{
      const o = orders.find(x=>x.id===b.dataset.refund);
      if(await U.confirm('Confirm refund',`Refund order #${o.id.slice(-4)} (${U.money(o.total)})? It will be written to the audit log.`,{ok:'Confirm refund',danger:true})){
        await MKR.db.put('orders',{id:o.id, status:'refunded'});
        await MKR.audit.log({action:'order.refund', desc:`Refund #${o.id.slice(-4)}`, amount:o.total, target:o.id});
        await MKR.db.put('alerts',{type:'refund', level:'amber', title:'Order refunded', desc:`#${o.id.slice(-4)} refunded ${U.money(o.total)}`, read:false, ts:Date.now()});
        m.close(); U.toast('Refunded and logged','amber'); ordersModal();
      }
    });
  }
})();
