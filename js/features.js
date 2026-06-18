/* ===== Feature switches + role permissions =====
   The owner controls each module (on/off, which roles can use it) in Settings.
   The config is stored in app_meta.settings.modules (synced to the cloud, so it
   is consistent across devices).
   Navigation and pages use MKR.features.can(key, role) to decide visibility.
*/
window.MKR = window.MKR || {};
(function(){
  const DEFAULTS = {
    pos:      {label:'POS / Ordering',     on:true, roles:['manager','staff']},
    kds:      {label:'Kitchen Display',    on:true, roles:['manager','staff']},
    menu:     {label:'Menu & Items',       on:true, roles:['manager']},
    blinddrop:{label:'Blind drop',         on:true, roles:['manager','staff']},
    schedule: {label:'Smart rostering',    on:true, roles:['manager']},
    hire:     {label:'One-Click Add Users',on:true, roles:['manager']},
    tasks:    {label:'Task checklist',      on:true, roles:['manager','staff']},
    swaps:    {label:'Swap / SOS approval', on:true, roles:['manager']},
    market:   {label:'Staff swap market',   on:true, roles:['staff']},
    availability:{label:'Staff availability',on:true, roles:['staff']},
    qrorder:  {label:'Table QR ordering',   on:true, roles:['manager']},
    bookings: {label:'Bookings & queue',     on:true, roles:['manager']},
    notify:   {label:'Notifications & nudges',on:true, roles:['owner','manager','staff']},
  };

  let _cache=null;

  // Each kitchen (tenant) carries its own `modules` selection; we fall back to the
  // legacy global app_meta.settings.modules and then to DEFAULTS.
  async function savedModules(){
    const sess = MKR.auth && MKR.auth.current && MKR.auth.current();
    if(sess && sess.kitchenId){
      try{ const k = await MKR.db.get('kitchens', sess.kitchenId); if(k && k.modules && Object.keys(k.modules).length) return k.modules; }catch(e){}
    }
    const s = (await MKR.db.meta('settings')) || {};
    return s.modules || {};
  }

  const F = {
    DEFAULTS,
    async load(){
      const saved = await savedModules();
      const merged = {};
      // Keep on/roles from saved data, but ALWAYS take the label from DEFAULTS
      // (the English source) so the i18n layer controls the displayed language.
      // Older data stored hardcoded Chinese labels — ignore them.
      for(const k in DEFAULTS) merged[k] = {...DEFAULTS[k], ...(saved[k]||{}), label:DEFAULTS[k].label};
      _cache = merged; return merged;
    },
    get(){ return _cache || DEFAULTS; },
    config(key){ return (_cache||DEFAULTS)[key]; },
    // Whether the module is open to a given role (owner / superadmin see every enabled module)
    can(key, role){
      const m = (_cache||DEFAULTS)[key];
      if(!m) return true;                 // unregistered modules are always allowed
      if(role==='owner'||role==='superadmin') return !!m.on;
      return !!m.on && (!role || (m.roles||[]).includes(role));
    },
    // Persist onto the current kitchen (per-tenant); fall back to global settings.
    async save(modules, kitchenId){
      const sess = MKR.auth && MKR.auth.current && MKR.auth.current();
      const kid = kitchenId || (sess && sess.kitchenId);
      if(kid){ await MKR.db.put('kitchens', {id:kid, modules}); }
      else { const s=(await MKR.db.meta('settings'))||{}; s.modules=modules; await MKR.db.meta('settings', s); }
      _cache = null; await F.load();
    }
  };
  MKR.features = F;
})();
