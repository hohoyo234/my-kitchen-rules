/* ===== Deduction-based inventory / stock =====
   Each dish carries a recipe (menu.recipe). When an order is paid, ingredients
   are deducted per recipe × quantity; anything at/below its reorder level raises
   a low-stock alert for the owner.

   Storage: one row per ingredient in the `inventory` table (id + data + kitchenId),
   so it's tenant-isolated by RLS and writable by active staff at the POS (unlike
   app_meta, which only owner/manager can write). Local-first: works offline; cloud
   sync needs supabase/inventory-setup.sql run once.
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;
  function kid(){ const s=MKR.auth&&MKR.auth.current&&MKR.auth.current(); return (s&&s.kitchenId)||'k_main'; }
  function rid(ing){ return kid()+'__'+ing; }
  function titleize(s){ return String(s||'').replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase()).trim(); }

  async function mine(){ const k=kid(); return (await MKR.db.getAll('inventory')).filter(r=>(r.kitchenId||'k_main')===k); }

  // Seed stock rows from the menu's recipes the first time (one row per ingredient).
  async function ensure(){
    const rows = await mine();
    if(rows.length) return rows;
    const menu = (await MKR.db.getAll('menu')).filter(m=>(m.kitchenId||'k_main')===kid());
    const ings = new Set(); menu.forEach(m=>Object.keys(m.recipe||{}).forEach(i=>ings.add(i)));
    for(const ing of ings) await MKR.db.put('inventory',{ id:rid(ing), ing, name:titleize(ing), qty:60, safety:12, unit:'units', kitchenId:kid() });
    return await mine();
  }
  async function list(){
    const rows = await ensure();
    return rows.map(r=>({...r, low:(+r.qty||0)<=(+r.safety||0)}))
               .sort((a,b)=> a.low===b.low ? String(a.name).localeCompare(b.name) : (a.low?-1:1));
  }
  async function setField(id, field, val){ await MKR.db.put('inventory',{id, [field]:val}); }
  async function adjust(id, delta){ const r=(await mine()).find(x=>x.id===id); if(r) await setField(id,'qty',Math.max(0,+( (+r.qty||0)+delta ).toFixed(2))); }
  async function addItem(name, unit, qty, safety){
    const ing = String(name||'').toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
    if(!ing) return;
    await MKR.db.put('inventory',{ id:rid(ing), ing, name:titleize(name), unit:unit||'units', qty:Math.max(0,+qty||0), safety:Math.max(0,+safety||0), kitchenId:kid() });
  }
  async function remove(id){ await MKR.db.remove('inventory', id); }

  // Deduct one paid order's ingredients. Idempotent via order.deducted.
  async function deductForOrder(order){
    if(!order || order.deducted) return;
    const menu = await MKR.db.getAll('menu');
    const rows = await mine(); const byIng={}; rows.forEach(r=>byIng[r.ing]=r);
    const low=[];
    for(const it of (order.items||[])){
      const m = menu.find(x=>x.id===it.id); const r=(m&&m.recipe)||{};
      for(const ing of Object.keys(r)){
        const row=byIng[ing]; if(!row) continue;
        const nq = Math.max(0, +( (+row.qty||0) - r[ing]*(it.qty||1) ).toFixed(2));
        row.qty = nq; await setField(row.id,'qty',nq);
        if(nq <= (+row.safety||0)) low.push(row);
      }
    }
    try{ await MKR.db.put('orders',{id:order.id, deducted:true}); }catch(e){}
    for(const row of low){
      try{ if(MKR.alerts) await MKR.alerts.raise({key:'lowstock-'+row.id, level:'amber', type:'stock',
        title:'Low stock', desc:`${row.name} is down to ${row.qty} ${row.unit||''} — reorder soon`}); }catch(e){}
    }
  }

  // ---------- UI page (owner + manager) ----------
  async function render(c){
    async function draw(){
      const rows = await list();
      c.innerHTML = `
        <div class="section-head"><div><h2>Inventory &amp; stock</h2><p>Stock auto-deducts as dishes sell · low items flag for reorder</p></div>
          <button class="btn btn-ghost btn-sm" id="invAdd">+ Add item</button></div>
        ${rows.length?'':'<div class="empty"><div class="em">📦</div><p>No stock items yet. They seed from your menu recipes on first open, or add one.</p></div>'}
        <div class="card" style="padding:8px 18px" id="invCard"></div>
        <div class="disclaimer mt16"><span>📦</span>Each sale deducts ingredients per the dish recipe. When an item reaches its reorder level it raises a low-stock alert for the owner.</div>`;
      const el=U.qs('#invCard',c);
      el.innerHTML = rows.map(r=>`
        <div class="li" style="flex-wrap:wrap;gap:10px">
          <div class="meta" style="min-width:150px"><b>${U.esc(r.name)}${r.low?' <span class="pill warn">Low</span>':''}</b><span>reorder at ${r.safety} ${U.esc(r.unit||'')}</span></div>
          <div class="row gap6 center wrap">
            <button class="btn btn-ghost btn-sm" data-adj="${r.id}" data-d="-1" aria-label="minus one">−</button>
            <b style="min-width:64px;text-align:center;font-variant-numeric:tabular-nums">${r.qty}<small class="faint"> ${U.esc(r.unit||'')}</small></b>
            <button class="btn btn-ghost btn-sm" data-adj="${r.id}" data-d="1" aria-label="plus one">+</button>
            <button class="btn btn-dark btn-sm" data-restock="${r.id}">Restock</button>
            <button class="btn btn-ghost btn-sm" data-edit="${r.id}" aria-label="edit">⚙️</button>
          </div></div>`).join('');
      U.qsa('[data-adj]',el).forEach(b=>b.onclick=async()=>{ await adjust(b.dataset.adj, Number(b.dataset.d)); draw(); });
      U.qsa('[data-restock]',el).forEach(b=>b.onclick=async()=>{ const r=rows.find(x=>x.id===b.dataset.restock); const to=prompt(`Restock ${r.name} to how many ${r.unit||'units'}?`, String((+r.safety||12)*6)); if(to==null) return; await setField(r.id,'qty',Math.max(0,Number(to)||0)); draw(); });
      U.qsa('[data-edit]',el).forEach(b=>b.onclick=()=>{ const r=rows.find(x=>x.id===b.dataset.edit); editModal(r, draw); });
      U.qs('#invAdd',c).onclick=()=>addModal(draw);
    }
    draw();
  }
  function addModal(after){
    U.modal('Add stock item', `
      <div class="field"><label>Name</label><input class="input" id="iv_n" placeholder="e.g. Tomatoes"></div>
      <div class="row"><div class="field grow"><label>Quantity</label><input class="input" id="iv_q" type="number" value="60"></div>
        <div class="field grow"><label>Unit</label><input class="input" id="iv_u" value="units"></div>
        <div class="field grow"><label>Reorder at</label><input class="input" id="iv_s" type="number" value="12"></div></div>`,
      {actions:[{label:'Cancel',class:'btn-ghost',onClick:c=>c()},{label:'Add',class:'btn-dark',onClick:async(c)=>{
        const n=U.qs('#iv_n').value.trim(); if(!n){ U.toast('Enter a name','red'); return; }
        await addItem(n, U.qs('#iv_u').value.trim(), U.qs('#iv_q').value, U.qs('#iv_s').value); c(); U.toast('Added','green'); after();
      }}]});
  }
  function editModal(r, after){
    U.modal('Edit '+U.esc(r.name), `
      <div class="field"><label>Name</label><input class="input" id="iv_n" value="${U.esc(r.name)}"></div>
      <div class="row"><div class="field grow"><label>Unit</label><input class="input" id="iv_u" value="${U.esc(r.unit||'')}"></div>
        <div class="field grow"><label>Reorder level</label><input class="input" id="iv_s" type="number" value="${r.safety}"></div></div>`,
      {actions:[
        {label:'Delete',class:'btn-ghost',onClick:async(c)=>{ if(!(await U.confirm('Delete item',`Remove ${r.name} from inventory?`,{ok:'Delete',danger:true}))) return; await remove(r.id); c(); U.toast('Deleted','amber'); after(); }},
        {label:'Save',class:'btn-dark',onClick:async(c)=>{ await MKR.db.put('inventory',{id:r.id, name:titleize(U.qs('#iv_n').value), unit:U.qs('#iv_u').value.trim(), safety:Math.max(0,Number(U.qs('#iv_s').value)||0)}); c(); U.toast('Saved','green'); after(); }}
      ]});
  }

  MKR.inventory = { ensure, all:mine, list, adjust, setField, addItem, remove, deductForOrder, render };
})();
