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
    notify:   {label:'Notifications & nudges',on:true, roles:['owner','manager','staff']},
  };

  let _cache=null;

  const F = {
    DEFAULTS,
    async load(){
      const s = (await MKR.db.meta('settings')) || {};
      const saved = s.modules || {};
      const merged = {};
      for(const k in DEFAULTS) merged[k] = {...DEFAULTS[k], ...(saved[k]||{})};
      _cache = merged; return merged;
    },
    get(){ return _cache || DEFAULTS; },
    config(key){ return (_cache||DEFAULTS)[key]; },
    // Whether the module is open to a given role (owner is super admin — sees every enabled module)
    can(key, role){
      const m = (_cache||DEFAULTS)[key];
      if(!m) return true;                 // unregistered modules are always allowed
      if(role==='owner') return !!m.on;   // owner passes through (not role-restricted)
      return !!m.on && (!role || (m.roles||[]).includes(role));
    },
    async save(modules){
      const s = (await MKR.db.meta('settings')) || {};
      s.modules = modules;
      await MKR.db.meta('settings', s);
      _cache = null; await F.load();
    }
  };
  MKR.features = F;
})();
