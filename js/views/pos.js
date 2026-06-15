/* ===== 前台收银 POS：点餐 / 快准点钱 / 盲对账 ===== */
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
      // 草稿恢复
      const d = MKR.db.draft.load('pos-cart');
      if(d && d.data && d.data.length && !cart.length){
        cart = d.data;
        U.toast('已恢复上次未结的订单','amber');
      }

      container.innerHTML = `
        <div class="section-head">
          <div><h2>点餐收银 POS</h2><p>快速加单 · 收款找零 · 打烊盲对账防偷钱</p></div>
          <div class="row gap8 wrap">
            ${(MKR.features && MKR.features.can('blinddrop', MKR.auth.current().role))?'<button class="btn btn-ghost btn-sm" id="blindBtn">🥁 打烊盲对账</button>':''}
            <button class="btn btn-ghost btn-sm" id="ordersBtn">📋 今日订单</button>
          </div>
        </div>
        <div class="pos">
          <div>
            <div class="cat-tabs" id="cats">
              <button class="active" data-c="*">全部</button>
              ${cats.map(c=>`<button data-c="${c}">${c}</button>`).join('')}
            </div>
            <div class="menu-grid" id="menuGrid"></div>
          </div>
          <div class="card" style="padding:18px">
            <div class="cart">
              <div class="section-title">当前订单 <span id="tableWrap"><input class="input" id="tableNo" placeholder="桌号" style="height:36px;width:84px;font-size:13px"></span></div>
              <div class="cart-lines" id="cartLines"></div>
              <div class="cart-total"><span>小计</span><span id="sub">$0.00</span></div>
              <div class="cart-total" id="discRow" style="display:none;color:var(--accent)"><span>折扣</span><span id="discAmt"></span></div>
              <div class="cart-total"><span>应收</span><span class="v" id="tot">$0.00</span></div>
              <div class="col gap8">
                <button class="btn btn-dark btn-block" id="payBtn">💳 收款并下单</button>
                <div class="row gap8">
                  <button class="btn btn-ghost btn-sm grow" id="discBtn">手动打折</button>
                  <button class="btn btn-ghost btn-sm grow" id="clearBtn">清空</button>
                </div>
              </div>
              <div class="disclaimer mt12"><span>🔒</span>取消、打折、退款将全程记入不可篡改的审计日志。</div>
            </div>
          </div>
        </div>`;

      const grid = U.qs('#menuGrid', container);
      function drawMenu(cat){
        const items = menu.filter(m=>cat==='*'||m.cat===cat);
        grid.innerHTML = items.map(m=>`
          <button class="menu-item" data-id="${m.id}">
            <span class="nm">${m.nm}</span><span class="pr">${U.money(m.price)}</span>
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
        if(!cart.length){ lines.innerHTML = `<div class="empty" style="padding:24px"><div class="em">🧾</div><p>点击左侧菜品开始下单</p></div>`; }
        else lines.innerHTML = cart.map((l,i)=>`
          <div class="cart-line">
            <div class="grow"><b>${l.nm}</b>${l.note?`<div class="note" data-note="${i}">📝 ${U.esc(l.note)}</div>`:`<div class="note" data-note="${i}">+ 加备注</div>`}</div>
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
        const wrap = U.el(`<div><input class="input" id="nt" placeholder="如：去葱、不要辣、走冰" value="${U.esc(cart[i].note)}"></div>`);
        const m = U.modal('菜品备注 · '+cart[i].nm, wrap, {actions:[
          {label:'保存', class:'btn-dark', onClick:(c)=>{ cart[i].note = U.qs('#nt',wrap).value.trim(); sync(); c(); }}
        ]});
        setTimeout(()=>U.qs('#nt',wrap).focus(),50);
      }

      U.qs('#discBtn',container).onclick = ()=>{
        if(!cart.length) return;
        const wrap = U.el(`<div><div class="field"><label>折扣百分比 %</label><input class="input" id="dp" type="number" min="0" max="100" value="${discountPct}"></div></div>`);
        U.modal('手动打折', wrap, {actions:[
          {label:'应用', class:'btn-dark', onClick:async(c)=>{
            discountPct = Math.min(100,Math.max(0,+U.qs('#dp',wrap).value||0));
            if(discountPct>0) await MKR.audit.log({action:'order.discount', desc:`手动打折 ${discountPct}%`, amount:subtotal()*discountPct/100});
            sync(); c();
          }}
        ]});
      };
      U.qs('#clearBtn',container).onclick = async ()=>{
        if(!cart.length) return;
        if(await U.confirm('清空订单','确定清空当前订单？',{ok:'清空',danger:true})){
          cart=[]; discountPct=0; MKR.db.draft.clear('pos-cart'); sync();
        }
      };
      U.qs('#payBtn',container).onclick = ()=> payModal(container, drawCart, ()=>{ cart=[]; discountPct=0; MKR.db.draft.clear('pos-cart'); MKR.net.setDirty(false); drawCart(); });
      const _bb=U.qs('#blindBtn',container); if(_bb) _bb.onclick = ()=> blindDrop(container);
      U.qs('#ordersBtn',container).onclick = ()=> ordersModal();

      // 暴露给收款流程
      MKR.views.pos._total = total; MKR.views.pos._cart = ()=>cart;
      drawCart();
    }
  };

  // ---------- 收款（现金找零 / 刷卡）----------
  function payModal(container, drawCart, onPaid){
    const amount = total();
    const cartSnapshot = cart.map(l=>({...l}));
    const tableNo = (U.qs('#tableNo',container)||{}).value || '';
    let method='cash';
    const wrap = U.el(`
      <div>
        <div class="cart-total"><span>应收</span><span class="v">${U.money(amount)}</span></div>
        <div class="cat-tabs mt8" id="pm">
          <button class="active" data-m="cash">💵 现金</button>
          <button data-m="card">💳 刷卡</button>
        </div>
        <div id="cashArea">
          <div class="field"><label>实收现金</label><input class="input" id="recv" type="number" inputmode="decimal" placeholder="顾客给了多少"></div>
          <div class="cart-total"><span>找零</span><span class="v" id="change">$0.00</span></div>
        </div>
      </div>`);
    const m = U.modal('收款', wrap, {actions:[
      {label:'确认收款 · 下单传后厨', class:'btn-green', onClick:async(close)=>{
        const order = {
          items: cartSnapshot, subtotal: cartSnapshot.reduce((s,l)=>s+l.price*l.qty,0),
          total: amount, discountPct, method, table: tableNo,
          status:'cooking', paid:true, payStatus:'paid'
        };
        const saved = await MKR.db.put('orders', order);
        await MKR.audit.log({action:'order.create', desc:`下单 #${saved.id.slice(-4)}${tableNo?' · 桌'+tableNo:''} · ${method==='cash'?'现金':'刷卡'}`, amount:amount, target:saved.id});
        U.toast(`已收款 ${U.money(amount)} · 已传后厨`,'green');
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

  // ---------- 打烊盲对账 (Blind Drop) ----------
  async function blindDrop(container){
    const orders = await MKR.db.getAll('orders');
    const todayCash = orders.filter(o=>isToday(o.createdAt) && o.method==='cash');
    const expected = todayCash.reduce((s,o)=>s+o.total,0);   // 后台应收（隐藏！）
    const counts = {};
    DENOMS.forEach(d=>counts[d]=0);

    const wrap = U.el(`
      <div>
        <div class="alert info" style="margin-bottom:14px"><span>🙈</span><div>后台应收金额已隐藏。请先<b>盲数抽屉现金</b>并录入，系统再比对生成差异报告。</div></div>
        <div class="section-title">点击钞票/硬币数量</div>
        <div class="cash-grid" id="cg">
          ${DENOMS.map(d=>`
            <div class="denom"><b>${d>=1?'$'+d:(d*100)+'¢'}</b>
              <div class="ct"><button data-m="${d}">−</button><span id="c${String(d).replace('.','_')}">0</span><button data-p="${d}">+</button></div>
            </div>`).join('')}
        </div>
        <div class="total-box"><span>盲数现金合计</span><span class="v" id="counted">$0.00</span></div>
      </div>`);

    function recalc(){
      let tot=0; DENOMS.forEach(d=> tot+=counts[d]*d);
      U.qs('#counted',wrap).textContent = U.money(tot);
      return tot;
    }
    U.qsa('[data-p]',wrap).forEach(b=>b.onclick=()=>{ const d=+b.dataset.p; counts[d]++; U.qs('#c'+String(d).replace('.','_'),wrap).textContent=counts[d]; recalc(); });
    U.qsa('[data-m]',wrap).forEach(b=>b.onclick=()=>{ const d=+b.dataset.m; counts[d]=Math.max(0,counts[d]-1); U.qs('#c'+String(d).replace('.','_'),wrap).textContent=counts[d]; recalc(); });

    U.modal('打烊盲对账 · Blind Drop', wrap, {actions:[
      {label:'提交对账', class:'btn-dark', onClick:async(close)=>{
        const counted = recalc();
        const variance = +(counted-expected).toFixed(2);
        const settings = await MKR.db.meta('settings');
        const thr = settings.cashVarianceThreshold||20;
        const rec = await MKR.db.put('reconciliations',{date:U.todayISO(), expected, counted, variance, by: MKR.auth.current().name});
        await MKR.audit.log({action:'pay.blinddrop', desc:`盲对账 · 实收${U.money(counted)} / 应收${U.money(expected)}`, amount:variance});
        // 差异超标 → 给老板生成红色警报
        if(Math.abs(variance)>thr){
          await MKR.db.put('alerts',{type:'cash', level:'red', title:'现金盲对账差异超标',
            desc:`差异 ${variance>=0?'+':''}${U.money(variance)}（应收 ${U.money(expected)} / 实收 ${U.money(counted)}）`, read:false, ts:Date.now()});
        }
        close();
        // 结果展示
        const ok = Math.abs(variance)<=thr;
        U.modal('对账结果', `
          <div class="alert ${ok?'green':'red'}"><span>${ok?'✅':'⚠️'}</span><div>
            <b>差异 ${variance>=0?'+':''}${U.money(variance)}</b><br>
            应收 ${U.money(expected)} · 实收 ${U.money(counted)}<br>
            ${ok?'在允许范围内，差异报告已存档。':'已超过阈值 '+U.money(thr)+'，红色警报已推送老板。'}
          </div></div>
          <p class="muted mt12" style="font-size:13px">已生成不可篡改的对账记录，老板端可查看。</p>`,
          {actions:[{label:'知道了',class:'btn-dark',onClick:c=>c()}]});
      }}
    ]});
  }

  // ---------- 今日订单（含取消/退款）----------
  async function ordersModal(){
    const orders = (await MKR.db.getAll('orders')).filter(o=>isToday(o.createdAt)).sort((a,b)=>b.createdAt-a.createdAt);
    const body = U.el(`<div class="list"></div>`);
    if(!orders.length) body.innerHTML = `<div class="empty"><div class="em">📋</div><p>今日还没有订单</p></div>`;
    else body.innerHTML = orders.map(o=>`
      <div class="li">
        <div class="ava">${o.method==='cash'?'💵':'💳'}</div>
        <div class="meta"><b>#${o.id.slice(-4)} · ${U.money(o.total)}${o.table?' · 桌'+o.table:''}</b>
          <span>${U.fmtTime(o.createdAt)} · ${o.items.length} 项 · ${({cooking:'制作中',done:'已完成',cancelled:'已取消',refunded:'已退款'})[o.status]||o.status}</span></div>
        ${o.status==='cancelled'||o.status==='refunded'?`<span class="pill danger">${o.status==='refunded'?'已退款':'已取消'}</span>`:
          `<button class="btn btn-ghost btn-sm" data-refund="${o.id}">退款</button>`}
      </div>`).join('');
    const m = U.modal('今日订单', body);
    U.qsa('[data-refund]',body).forEach(b=>b.onclick=async()=>{
      const o = orders.find(x=>x.id===b.dataset.refund);
      if(await U.confirm('退款确认',`确定退款订单 #${o.id.slice(-4)}（${U.money(o.total)}）？将记入审计日志。`,{ok:'确认退款',danger:true})){
        await MKR.db.put('orders',{id:o.id, status:'refunded'});
        await MKR.audit.log({action:'order.refund', desc:`退款 #${o.id.slice(-4)}`, amount:o.total, target:o.id});
        await MKR.db.put('alerts',{type:'refund', level:'amber', title:'订单退款', desc:`#${o.id.slice(-4)} 退款 ${U.money(o.total)}`, read:false, ts:Date.now()});
        m.close(); U.toast('已退款并记录审计','amber'); ordersModal();
      }
    });
  }
})();
