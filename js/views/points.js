/* ===== Customer self-service: my rewards (public, no login) =====
   A customer enters their phone number or member code and sees their own
   points, stored-value balance and active coupons. Lookup goes through a
   Supabase SECURITY DEFINER function (member_self_lookup) so anon can read
   ONLY their own matched row — never list everyone. Route: #/points
*/
window.MKR = window.MKR || {};
(function(){
  const U = ()=>MKR.util;

  function note(cls, msg){ return `<div class="alert ${cls}"><span>ℹ️</span><div>${MKR.util.esc(msg)}</div></div>`; }

  async function render(root){
    root.innerHTML = `
      <div class="cust-wrap">
        <header class="cust-head"><div><div class="cust-brand">My Kitchen</div><div class="cust-table">⭐ My rewards</div></div></header>
        <div class="card pad20" style="max-width:420px;margin:18px auto">
          <div class="field"><label>Phone or member code</label><input class="input" id="pq" placeholder="0400 000 000 or M-code" autocomplete="off"></div>
          <button class="btn btn-dark btn-block" id="pgo">Look up my rewards</button>
          <div id="pres" class="mt16"></div>
        </div>
      </div>`;

    async function go(){
      const q = U().qs('#pq',root).value.trim(); if(!q) return;
      const res = U().qs('#pres',root); res.innerHTML = `<p class="muted">Looking…</p>`;
      if(!(MKR.supa && MKR.supa.client)){ res.innerHTML = note('amber','Not available offline'); return; }
      let data=null, error=null;
      try{ const r = await MKR.supa.client.rpc('member_self_lookup',{ q }); data=r.data; error=r.error; }catch(e){ error=e; }
      if(error){ res.innerHTML = note('amber','This feature isn’t enabled yet — please ask staff.'); return; }
      if(!data){ res.innerHTML = note('amber','No member found for that phone or code.'); return; }
      const cpns = data.coupons || [];
      res.innerHTML = `
        <div class="alert green"><span>⭐</span><div>Hi ${U().esc(data.name||'there')} — here are your rewards.</div></div>
        <div class="grid g2 mt12">
          <div class="card stat"><div class="k">⭐ Points</div><div class="v">${data.points||0}</div></div>
          <div class="card stat"><div class="k">💰 Balance</div><div class="v">${U().money(data.balance||0)}</div></div>
        </div>
        <div class="section-title mt16">🎟️ My coupons</div>
        ${cpns.length ? cpns.map(c=>`<div class="li"><div class="ava">🎟️</div>
          <div class="meta"><b>${U().esc(c.code)} · ${c.type==='pct'?c.value+'% off':U().money(c.value)+' off'}</b>
            <span>${c.minSpend?'min '+U().money(c.minSpend):''}${c.expiry?(c.minSpend?' · ':'')+'exp '+c.expiry:''}</span></div></div>`).join('')
          : '<div class="empty"><p>No active coupons</p></div>'}
        <p class="muted mt12" style="font-size:12px">Show this screen at the counter, or give your phone number when you order.</p>`;
    }
    U().qs('#pgo',root).onclick = go;
    U().qs('#pq',root).addEventListener('keydown', e=>{ if(e.key==='Enter') go(); });
    setTimeout(()=>{ const f=U().qs('#pq',root); if(f) f.focus(); },50);
  }

  MKR.points = { render };
})();
