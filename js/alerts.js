/* ===== 警报中心（去重）=====
   raise() 在生成警报前检查是否已有同 key 的未读警报，避免重复刷屏。
*/
window.MKR = window.MKR || {};
(function(){
  MKR.alerts = {
    async raise({key, level='amber', type='', title, desc}){
      const all = await MKR.db.getAll('alerts');
      if(key && all.some(a=>a.key===key && !a.read)) return null;
      return MKR.db.put('alerts',{key, level, type, title, desc, read:false, ts:Date.now()});
    },
    // 班次的计划开始时间戳（本周对应星期 + HH:MM）
    shiftStartTs(shift){
      const base = MKR.seed.dayTs(shift.day);
      const [h,m] = shift.start.split(':').map(Number);
      return base + (h*60+m)*60000;
    }
  };
})();
