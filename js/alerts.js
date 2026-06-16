/* ===== Alert center (deduplicated) =====
   raise() checks for an existing unread alert with the same key before creating
   a new one, so the same issue doesn't spam the feed.
*/
window.MKR = window.MKR || {};
(function(){
  MKR.alerts = {
    async raise({key, level='amber', type='', title, desc}){
      const all = await MKR.db.getAll('alerts');
      if(key && all.some(a=>a.key===key && !a.read)) return null;
      const saved = await MKR.db.put('alerts',{key, level, type, title, desc, read:false, ts:Date.now()});
      // Push to the owner proactively (received even when the app is closed; degrades silently with no backend)
      if(MKR.notify && MKR.notify.push) MKR.notify.push({role:'owner'}, (level==='red'?'🚨 ':'🔔 ')+(title||'Critical alert'), desc||'', 'al');
      return saved;
    },
    // A shift's planned start timestamp (this week's matching weekday + HH:MM)
    shiftStartTs(shift){
      const base = MKR.seed.dayTs(shift.day);
      const [h,m] = shift.start.split(':').map(Number);
      return base + (h*60+m)*60000;
    }
  };
})();
