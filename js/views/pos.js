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
          <button class="menu-item${m.img?' has-img':''}${m.soldOut?' is-soldout':''}" data-id="${m.id}"${m.soldOut?' disabled':''}>
            ${m.img?`<img class="mi-img" src="${m.img}" alt="${U.esc(m.nm)}">`:''}
            <span class="nm">${U.esc(m.nm)}</span><span class="pr">${m.soldOut?'Sold out':U.money(m.price)}</span>
          </button>`).join('');
        U.qsa('.menu-item',grid).forEach(b=> b.onclick=()=>{ if(b.disabled) return; addItem(b.dataset.id); });
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

  // ---------- Payment (cash / card / stored-value · member loyalty · coupons) ----------
  function payModal(container, drawCart, onPaid){
    const base = total();                                  // subtotal after manual discount
    const cartSnapshot = cart.map(l=>({...l}));
    const tableNo = (U.qs('#tableNo',container)||{}).value || '';
    const M = MKR.membership;
    let method='cash', member=null, coupon=null, redeemPts=0, cfg={pointsPerDollar:1, centsPerPoint:1};

    const wrap = U.el(`
      <div>
        <div class="mem-box" id="memBox"></div>
        <div class="cart-total"><span>Subtotal</span><span class="v" id="pSub">${U.money(base)}</span></div>
        <div class="cart-total" id="pCouponRow" style="display:none;color:var(--accent)"><span id="pCouponLbl">Coupon</span><span id="pCoupon"></span></div>
        <div class="cart-total" id="pRedeemRow" style="display:none;color:var(--accent)"><span>Points redeemed</span><span id="pRedeem"></span></div>
        <div class="cart-total"><span>Total due</span><span class="v" id="pDue">${U.money(base)}</span></div>

        <div class="row gap8 mt8 wrap" id="loyaltyCtrls">
          <button class="btn btn-ghost btn-sm grow" id="cpnBtn">🎟️ Coupon</button>
          <button class="btn btn-ghost btn-sm grow" id="redeemBtn" disabled>⭐ Redeem points</button>
        </div>

        <div class="cat-tabs mt12" id="pm">
          <button class="active" data-m="cash">💵 Cash</button>
          <button data-m="card">💳 Card</button>
          <button data-m="balance" id="pmBal" disabled>💰 Balance</button>
        </div>
        <div id="cashArea">
          <div class="field"><label>Cash received</label><input class="input" id="recv" type="number" inputmode="decimal" placeholder="How much did they give"></div>
          <div class="cart-total"><span>Change</span><span class="v" id="change">$0.00</span></div>
        </div>
        <div id="balArea" style="display:none"></div>
        <div class="earn-hint mt8" id="earnHint"></div>
      </div>`);

    // ----- derived amounts -----
    function couponDisc(){ return coupon ? Math.min(coupon.discount, base) : 0; }
    function afterCoupon(){ return Math.max(0, +(base - couponDisc()).toFixed(2)); }
    function redeemValue(){ return Math.min(afterCoupon(), +((redeemPts*cfg.centsPerPoint/100)).toFixed(2)); }
    function due(){ return Math.max(0, +(afterCoupon() - redeemValue()).toFixed(2)); }

    function drawMember(){
      const box = U.qs('#memBox',wrap);
      if(!member){
        box.innerHTML = `<button class="btn btn-ghost btn-block" id="addMem">👤 Add member · phone or QR</button>`;
        U.qs('#addMem',box).onclick = memberLookup;
      } else {
        box.innerHTML = `<div class="mem-card">
          <div class="grow"><b>${U.esc(member.name)}</b> <span class="pill ok">${member.id}</span>
            <div class="muted" style="font-size:12px">⭐ ${member.points||0} pts · 💰 ${U.money(member.balance||0)}${member.phone?' · '+U.esc(member.phone):''}</div></div>
          <button class="btn btn-ghost btn-sm" id="memX">Remove</button></div>`;
        U.qs('#memX',box).onclick = ()=>{ member=null; redeemPts=0; if(method==='balance') method='cash'; refresh(); };
      }
    }
    function refresh(){
      drawMember();
      // coupon row
      const cr=U.qs('#pCouponRow',wrap);
      if(coupon){ cr.style.display='flex'; U.qs('#pCouponLbl',wrap).textContent=`Coupon ${coupon.coupon.code}`; U.qs('#pCoupon',wrap).textContent='−'+U.money(couponDisc()); }
      else cr.style.display='none';
      // redeem row
      const rr=U.qs('#pRedeemRow',wrap);
      if(redeemPts>0){ rr.style.display='flex'; U.qs('#pRedeem',wrap).textContent=`−${U.money(redeemValue())} (${redeemPts} pts)`; }
      else rr.style.display='none';
      U.qs('#pDue',wrap).textContent = U.money(due());
      // controls availability
      U.qs('#redeemBtn',wrap).disabled = !(member && (member.points||0)>0);
      const balBtn=U.qs('#pmBal',wrap); balBtn.disabled = !(member && (member.balance||0)>=due() && due()>0);
      if(method==='balance' && balBtn.disabled){ method='cash'; U.qsa('#pm button',wrap).forEach(x=>x.classList.toggle('active',x.dataset.m==='cash')); }
      // method areas
      U.qs('#cashArea',wrap).style.display = method==='cash'?'block':'none';
      U.qs('#balArea',wrap).style.display = method==='balance'?'block':'none';
      if(method==='balance') U.qs('#balArea',wrap).innerHTML = `<div class="alert info"><span>💰</span><div>Pay ${U.money(due())} from balance · remaining ${U.money((member.balance||0)-due())}</div></div>`;
      // change calc
      const recv=U.qs('#recv',wrap); if(recv){ const c=(+recv.value||0)-due(); U.qs('#change',wrap).textContent=U.money(Math.max(0,c)); }
      // earn hint
      const willEarn = member ? Math.floor(due()*cfg.pointsPerDollar) : 0;
      U.qs('#earnHint',wrap).innerHTML = member ? `<span class="muted">⭐ ${member.name} will earn <b>${willEarn}</b> points on this order</span>` : '';
    }

    // ----- member lookup / create -----
    function memberLookup(){
      const lw=U.el(`<div>
        <div class="field"><label>Phone or member QR code</label><input class="input" id="mq" placeholder="0400 000 000 or M-code" autocomplete="off"></div>
        <div id="mRes"></div></div>`);
      const lm=U.modal('Add member', lw, {actions:[
        {label:'Find', class:'btn-dark', onClick:async()=>{
          const q=U.qs('#mq',lw).value.trim(); if(!q) return;
          const found=await M.lookup(q);
          const res=U.qs('#mRes',lw);
          if(found){ member=found; lm.close(); refresh(); U.toast('Member added','green'); return; }
          const digits=q.replace(/\D/g,'');
          res.innerHTML = `<div class="alert amber"><span>🆕</span><div>No member found.${digits.length>=5?' Create one with this phone?':''}</div></div>
            ${digits.length>=5?`<div class="field"><label>Member name</label><input class="input" id="mNew" placeholder="Customer name"></div>
            <button class="btn btn-green btn-block" id="mCreate">Create member</button>`:''}`;
          const cb=U.qs('#mCreate',res);
          if(cb) cb.onclick=async()=>{ member=await M.create({phone:q, name:U.qs('#mNew',res).value.trim()}); lm.close(); refresh(); U.toast('New member created','green'); };
        }}
      ]});
      setTimeout(()=>U.qs('#mq',lw).focus(),50);
    }

    // ----- coupon -----
    U.qs('#cpnBtn',wrap).onclick=()=>{
      const cw=U.el(`<div><div class="field"><label>Coupon code</label><input class="input" id="cc" placeholder="e.g. SAVE10" autocomplete="off"></div><div id="cMsg"></div></div>`);
      const cm=U.modal('Apply coupon', cw, {actions:[
        {label:'Apply', class:'btn-dark', onClick:async()=>{
          const code=U.qs('#cc',cw).value.trim(); if(!code) return;
          const v=await M.validateCoupon(code, member, base);
          if(!v.ok){ U.qs('#cMsg',cw).innerHTML=`<div class="alert red"><span>⚠️</span><div>${U.esc(v.reason)}</div></div>`; return; }
          coupon=v; cm.close(); refresh(); U.toast('Coupon applied','green');
        }}
      ]});
      setTimeout(()=>U.qs('#cc',cw).focus(),50);
    };

    // ----- redeem points -----
    U.qs('#redeemBtn',wrap).onclick=()=>{
      if(!member) return;
      const maxByPts=member.points||0;
      const maxByDue=Math.floor(afterCoupon()*100/Math.max(1,cfg.centsPerPoint));
      const maxPts=Math.max(0, Math.min(maxByPts, maxByDue));
      const rw=U.el(`<div>
        <div class="alert info"><span>⭐</span><div>${member.name} has <b>${maxByPts}</b> points · worth up to ${U.money(maxPts*cfg.centsPerPoint/100)} here</div></div>
        <div class="field"><label>Points to redeem (max ${maxPts})</label><input class="input" id="rp" type="number" min="0" max="${maxPts}" value="${Math.min(redeemPts||maxPts, maxPts)}"></div></div>`);
      U.modal('Redeem points', rw, {actions:[
        {label:'Apply', class:'btn-dark', onClick:(c)=>{ redeemPts=Math.max(0,Math.min(maxPts, Math.floor(+U.qs('#rp',rw).value||0))); refresh(); c(); }}
      ]});
    };

    const m = U.modal('Payment', wrap, {actions:[
      {label:'Confirm payment · send to kitchen', class:'btn-green', onClick:async(close)=>{
        const payable = due();
        if(method==='balance' && (!member || (member.balance||0)<payable)){ U.toast('Insufficient balance','red'); return; }
        const earned = member ? Math.floor(payable*cfg.pointsPerDollar) : 0;
        const order = {
          items: cartSnapshot, subtotal: cartSnapshot.reduce((s,l)=>s+l.price*l.qty,0),
          total: payable, discountPct, method, table: tableNo,
          couponCode: coupon?coupon.coupon.code:null, couponDiscount: couponDisc(),
          pointsRedeemed: redeemPts, redeemValue: redeemValue(), pointsEarned: earned,
          memberId: member?member.id:null, memberName: member?member.name:null,
          balanceUsed: method==='balance'?payable:0,
          kitchenId: (MKR.auth.current()&&MKR.auth.current().kitchenId)||'k_main',
          server: (MKR.auth.current()&&MKR.auth.current().name)||'', serverId: (MKR.auth.current()&&MKR.auth.current().id)||'',
          status:'cooking', paid:true, payStatus:'paid'
        };
        const saved = await MKR.db.put('orders', order);
        // Deduct ingredients per dish recipe (no-op if the venue isn't using inventory)
        try{ if(MKR.inventory) await MKR.inventory.deductForOrder(saved); }catch(e){}
        let updatedMember = null;
        if(member) updatedMember = await M.applyOrder(member.id, {orderId:saved.id, paid:payable, earned, redeemPoints:redeemPts, balanceUsed:order.balanceUsed, couponCode:order.couponCode});
        if(coupon) await M.redeemCoupon(coupon.coupon, saved.id);
        const methodLbl = method==='cash'?'cash':method==='card'?'card':'balance';
        await MKR.audit.log({action:'order.create', desc:`Order #${saved.id.slice(-4)}${tableNo?' · table '+tableNo:''} · ${methodLbl}${member?' · '+member.name:''}`, amount:payable, target:saved.id});
        U.toast(`Took ${U.money(payable)} · sent to kitchen${earned?` · +${earned} pts`:''}`,'green');
        const recv = method==='cash' ? (+U.qs('#recv',wrap).value||0) : 0;
        close(); onPaid();
        receiptPrompt(saved, {member:updatedMember||member, earned, redeemPts, couponDisc:couponDisc(), redeemValue:redeemValue(), method, methodLbl, cash:recv});
      }}
    ]});

    U.qsa('#pm button',wrap).forEach(b=>b.onclick=()=>{
      if(b.disabled) return;
      U.qsa('#pm button',wrap).forEach(x=>x.classList.remove('active')); b.classList.add('active');
      method=b.dataset.m; refresh();
    });
    U.qs('#recv',wrap).oninput = ()=>{ const c=(+U.qs('#recv',wrap).value||0)-due(); U.qs('#change',wrap).textContent = U.money(Math.max(0,c)); };

    // load loyalty config, then first paint
    (async()=>{ try{ cfg=await M.config(); }catch(e){} refresh(); })();
  }

  // ---------- Receipt ----------
  async function buildReceipt(order, info){
    const brand = await MKR.db.meta('brand');
    const shop = (brand && brand.name) || 'My Kitchen';
    const i = info || {};
    const line = (l)=>`<div class="rc-row"><span>${i_qty(l)}× ${U.esc(l.nm)}${l.note?` <i>(${U.esc(l.note)})</i>`:''}</span><span>${U.money(l.price*l.qty)}</span></div>`;
    function i_qty(l){ return l.qty; }
    const sub = (order.items||[]).reduce((s,l)=>s+l.price*l.qty,0);
    const rows = [];
    rows.push(`<div class="rc-row"><span>Subtotal</span><span>${U.money(sub)}</span></div>`);
    if(order.discountPct) rows.push(`<div class="rc-row"><span>Discount ${order.discountPct}%</span><span>−${U.money(sub*order.discountPct/100)}</span></div>`);
    if(i.couponDisc) rows.push(`<div class="rc-row"><span>Coupon ${U.esc(order.couponCode||'')}</span><span>−${U.money(i.couponDisc)}</span></div>`);
    if(i.redeemValue) rows.push(`<div class="rc-row"><span>Points redeemed (${i.redeemPts})</span><span>−${U.money(i.redeemValue)}</span></div>`);
    const methodMap = {cash:'Cash', card:'Card', balance:'Stored value'};
    return `<div class="receipt">
      <div class="rc-head"><b>${U.esc(shop)}</b><div class="rc-sub">Tax invoice (indicative)</div></div>
      <div class="rc-meta">#${order.id.slice(-6)} · ${U.fmtDateTime(order.createdAt||Date.now())}${order.table?` · Table ${U.esc(order.table)}`:''}${order.server?`<br>Served by ${U.esc(order.server)}`:''}</div>
      <div class="rc-items">${(order.items||[]).map(line).join('')}</div>
      <div class="rc-tot">${rows.join('')}
        <div class="rc-row rc-grand"><span>Total</span><span>${U.money(order.total)}</span></div>
        <div class="rc-row"><span>${methodMap[i.method]||'Paid'}</span><span>${i.method==='cash'&&i.cash?U.money(i.cash):U.money(order.total)}</span></div>
        ${i.method==='cash'&&i.cash>order.total?`<div class="rc-row"><span>Change</span><span>${U.money(i.cash-order.total)}</span></div>`:''}
      </div>
      ${i.member?`<div class="rc-member">⭐ ${U.esc(i.member.name)} · ${i.earned?`+${i.earned} pts · `:''}${i.member.points||0} pts total · Balance ${U.money(i.member.balance||0)}</div>`:''}
      <div class="rc-foot">Thank you — see you again!</div>
    </div>`;
  }

  async function receiptPrompt(order, info){
    const html = await buildReceipt(order, info);
    const wrap = U.el(`<div>${html}</div>`);
    U.modal('Receipt', wrap, {actions:[
      {label:'🖨️ Print / Save PDF', class:'btn-dark', onClick:(c)=>{ U.printHTML(html); }},
      {label:'Done', class:'btn-ghost', onClick:(c)=>c()}
    ]});
  }

  // ---------- Cash count: opening float (pre-open) or closing reconciliation ----------
  async function blindDrop(container){
    const orders = await MKR.db.getAll('orders');
    const todayCash = orders.filter(o=>isToday(o.createdAt) && o.method==='cash');
    const expected = todayCash.reduce((s,o)=>s+o.total,0);   // expected total (hidden in closing mode)
    let mode = 'close';                                       // 'open' | 'close'
    const counts = {}; DENOMS.forEach(d=>counts[d]=0);

    const wrap = U.el(`
      <div>
        <div class="cat-tabs" id="bdMode" style="margin-bottom:12px">
          <button data-mode="open">🌅 Opening float</button>
          <button class="active" data-mode="close">🌙 Closing count</button>
        </div>
        <div class="alert info" id="bdHint" style="margin-bottom:14px"></div>
        <div class="section-title">Enter note / coin counts (tap ± or type)</div>
        <div class="cash-grid" id="cg">
          ${DENOMS.map(d=>{ const id=String(d).replace('.','_'); return `
            <div class="denom"><b>${d>=1?'$'+d:(d*100)+'¢'}</b>
              <div class="ct"><button data-m="${d}">−</button>
              <input class="cash-input" id="c${id}" data-cin="${d}" type="number" inputmode="numeric" min="0" value="0">
              <button data-p="${d}">+</button></div>
            </div>`; }).join('')}
        </div>
        <div class="total-box"><span id="bdTotLabel">Blind-counted total</span><span class="v" id="counted">$0.00</span></div>
      </div>`);

    function setMode(){
      U.qs('#bdHint',wrap).innerHTML = mode==='open'
        ? '<span>🌅</span><div>Count the cash going into the drawer to start the day — recorded as today\'s opening float (no comparison).</div>'
        : '<span>🙈</span><div>The expected total is hidden. Blind-count the drawer cash; the system compares it and generates a variance report.</div>';
      U.qs('#bdTotLabel',wrap).textContent = mode==='open' ? 'Opening float total' : 'Blind-counted total';
    }
    function recalc(){ let tot=0; DENOMS.forEach(d=> tot+=counts[d]*d); U.qs('#counted',wrap).textContent = U.money(tot); return tot; }
    function setCount(d,val){ counts[d]=Math.max(0,Math.floor(val)||0); U.qs('#c'+String(d).replace('.','_'),wrap).value=counts[d]; recalc(); }

    U.qsa('[data-p]',wrap).forEach(b=>b.onclick=()=>{ const d=+b.dataset.p; setCount(d, counts[d]+1); });
    U.qsa('[data-m]',wrap).forEach(b=>b.onclick=()=>{ const d=+b.dataset.m; setCount(d, counts[d]-1); });
    U.qsa('[data-cin]',wrap).forEach(inp=>inp.oninput=()=>{ counts[+inp.dataset.cin]=Math.max(0,Math.floor(+inp.value)||0); recalc(); });
    U.qsa('#bdMode button',wrap).forEach(b=>b.onclick=()=>{ U.qsa('#bdMode button',wrap).forEach(x=>x.classList.remove('active')); b.classList.add('active'); mode=b.dataset.mode; setMode(); });
    setMode();

    U.modal('Cash count', wrap, {actions:[
      {label:'Submit', class:'btn-dark', onClick:async(close)=>{
        const counted = recalc();
        if(mode==='open'){
          await MKR.db.put('reconciliations',{date:U.todayISO(), type:'open', counted, by:MKR.auth.current().name, ts:Date.now()});
          await MKR.audit.log({action:'pay.blinddrop', desc:`Opening float · ${U.money(counted)}`, amount:counted});
          close();
          U.modal('Opening float recorded', `<div class="alert green"><span>✅</span><div>Opening float <b>${U.money(counted)}</b> recorded for ${U.todayISO()}.</div></div>
            <p class="muted mt12" style="font-size:13px">At close, run the closing count to reconcile the drawer.</p>`,
            {actions:[{label:'Got it',class:'btn-dark',onClick:c=>c()}]});
          return;
        }
        // Closing reconciliation
        const variance = +(counted-expected).toFixed(2);
        const settings = await MKR.db.meta('settings');
        const thr = settings.cashVarianceThreshold||20;
        await MKR.db.put('reconciliations',{date:U.todayISO(), type:'close', expected, counted, variance, by: MKR.auth.current().name});
        await MKR.audit.log({action:'pay.blinddrop', desc:`Blind drop · counted ${U.money(counted)} / expected ${U.money(expected)}`, amount:variance});
        if(Math.abs(variance)>thr){
          await MKR.db.put('alerts',{type:'cash', level:'red', title:'Cash blind-drop variance over threshold',
            desc:`Variance ${variance>=0?'+':''}${U.money(variance)} (expected ${U.money(expected)} / counted ${U.money(counted)})`, read:false, ts:Date.now()});
        }
        close();
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
          <span>${U.fmtTime(o.createdAt)} · ${o.items.length} items${o.server?' · by '+U.esc(o.server):''} · ${({cooking:'Cooking',done:'Done',cancelled:'Cancelled',refunded:'Refunded'})[o.status]||o.status}</span></div>
        ${o.status==='cancelled'||o.status==='refunded'?`<span class="pill danger">${o.status==='refunded'?'Refunded':'Cancelled'}</span>`:
          `<button class="btn btn-ghost btn-sm" data-refund="${o.id}">Refund</button>`}
      </div>`).join('');
    const m = U.modal('Today\'s orders', body);
    U.qsa('[data-refund]',body).forEach(b=>b.onclick=async()=>{
      const o = orders.find(x=>x.id===b.dataset.refund);
      const authBy = await authorizeRefund(o);
      if(!authBy) return;
      await MKR.db.put('orders',{id:o.id, status:'refunded'});
      await MKR.audit.log({action:'order.refund', desc:`Refund #${o.id.slice(-4)} · approved by ${authBy}`, amount:o.total, target:o.id});
      await MKR.db.put('alerts',{type:'refund', level:'amber', title:'Order refunded', desc:`#${o.id.slice(-4)} refunded ${U.money(o.total)} · approved by ${authBy}`, read:false, ts:Date.now()});
      m.close(); U.toast('Refunded and logged','amber'); ordersModal();
    });
  }

  // Refunds move money, so they need a manager/owner. A manager/owner confirms
  // it themselves; a staff member must get a manager to enter their password.
  // Returns the authorizer's name, or null if cancelled / not authorized.
  async function authorizeRefund(o){
    const cur = MKR.auth.current() || {};
    if(['manager','owner','superadmin'].includes(cur.role)){
      const ok = await U.confirm('Confirm refund', `Refund order #${o.id.slice(-4)} (${U.money(o.total)})? It will be written to the audit log.`, {ok:'Confirm refund', danger:true});
      return ok ? (cur.name||'Manager') : null;
    }
    return new Promise(res=>{
      const wrap = U.el(`<div>
        <div class="alert info"><span>🔐</span><div>Refunds need a manager's approval. Ask a manager to sign off on refunding #${o.id.slice(-4)} (${U.money(o.total)}).</div></div>
        <div class="field"><label>Manager username</label><input class="input" id="ra_u" autocomplete="off"></div>
        <div class="field"><label>Manager password</label><input class="input" id="ra_p" type="password" autocomplete="off"></div>
      </div>`);
      const mm = U.modal('Manager approval', wrap, {actions:[
        {label:'Cancel', class:'btn-ghost', onClick:(c)=>{ c(); res(null); }},
        {label:'Approve refund', class:'btn-danger', onClick:async()=>{
          const u=U.qs('#ra_u',wrap).value.trim().toLowerCase(), p=U.qs('#ra_p',wrap).value;
          const users = await MKR.db.getAll('users');
          const mgr = users.find(x=>x.pw && x.pw===p && ['manager','owner'].includes(x.role) && !x.offboarded
            && ((x.username||'').toLowerCase()===u || (x.email||'').toLowerCase()===u));
          if(mgr){ mm.close(); res(mgr.name); return; }
          U.toast('Wrong manager username or password','red');
        }}
      ]});
      setTimeout(()=>{ const f=U.qs('#ra_u',wrap); if(f) f.focus(); },50);
    });
  }
})();
