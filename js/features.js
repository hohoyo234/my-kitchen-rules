/* ===== 功能开关 + 角色权限 =====
   老板在「系统设置」里控制:每个模块开/关、哪些角色可用。
   配置存 app_meta.settings.modules(随云端同步,多设备一致)。
   导航与页面通过 MKR.features.can(key, role) 判断是否显示/可进入。
*/
window.MKR = window.MKR || {};
(function(){
  const DEFAULTS = {
    pos:      {label:'收银点餐 POS',  on:true, roles:['manager','staff']},
    kds:      {label:'后厨看板 KDS',  on:true, roles:['manager','staff']},
    blinddrop:{label:'打烊盲对账',    on:true, roles:['manager','staff']},
    schedule: {label:'智能排班',      on:true, roles:['manager']},
    hire:     {label:'一键招人',      on:true, roles:['manager']},
    tasks:    {label:'任务清单',      on:true, roles:['manager','staff']},
    swaps:    {label:'换班/SOS 审批', on:true, roles:['manager']},
    market:   {label:'员工换班市场',  on:true, roles:['staff']},
    notify:   {label:'通知与催班提醒',on:true, roles:['owner','manager','staff']},
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
    // 该模块是否对某角色开放
    can(key, role){
      const m = (_cache||DEFAULTS)[key];
      if(!m) return true;                 // 未登记的一律放行
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
