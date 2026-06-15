/* ===== 通知中心(B 组)=====
   App 在线时:老板收红色警报、员工收 SOS、员工上班前 1 小时催班 → 系统通知 + 应用内提示。
   说明:这是「前台/在线」通知(浏览器开着即可,含后台标签页)。
   「关掉 App 也能收的后台推送」需 Service Worker + Web Push + Edge Function,属下一档。
*/
window.MKR = window.MKR || {};
(function(){
  let started=false, remTimer=null;
  const seenAlerts=new Set(), seenSos=new Set();

  const N = {
    supported: ('Notification' in window),
    granted(){ return N.supported && Notification.permission==='granted'; },

    // 申请通知权限(需在用户手势中调用,如登录按钮点击后)
    async enable(){
      if(!N.supported) return false;
      try{ const p = await Notification.requestPermission(); return p==='granted'; }catch(e){ return false; }
    },

    fire(title, body, tag){
      if(N.granted()){ try{ new Notification(title, {body:body||'', tag}); }catch(e){} }
      MKR.util.toast(body? (title+' · '+body) : title);   // 同时给应用内提示(兜底)
    },

    async start(role){
      if(started) return; started=true;
      // 初始化「已见」集合,避免开机把历史记录全弹一遍
      try{ (await MKR.db.getAll('alerts')).forEach(a=>seenAlerts.add(a.id)); }catch(e){}
      try{ (await MKR.db.getAll('sos')).forEach(s=>seenSos.add(s.id)); }catch(e){}

      if(role==='owner'){
        MKR.db.on('alerts', async ()=>{
          const all = await MKR.db.getAll('alerts');
          for(const a of all){
            if(!seenAlerts.has(a.id)){ seenAlerts.add(a.id);
              if(!a.read) N.fire((a.level==='red'?'🚨 ':'🔔 ')+(a.title||'异常警报'), a.desc||'', 'al-'+a.id);
            }
          }
        });
      }
      if(role==='staff'){
        MKR.db.on('sos', async ()=>{
          const all = await MKR.db.getAll('sos');
          for(const s of all){
            if(!seenSos.has(s.id)){ seenSos.add(s.id);
              if(s.status==='open' && !s.claimedBy) N.fire('🆘 紧急顶班', (s.title||'')+' · 奖励 '+(s.reward||''), 'sos-'+s.id);
            }
          }
        });
        N._startShiftReminder();
      }
    },

    async _checkShiftReminder(){
      const sess=MKR.auth.current(); if(!sess || sess.role!=='staff') return;
      const todayIdx=(new Date().getDay()+6)%7;
      const shifts=(await MKR.db.getAll('shifts')).filter(s=>s.staffId===sess.id && s.day===todayIdx);
      const now=Date.now();
      for(const s of shifts){
        const startTs=MKR.alerts.shiftStartTs(s);
        const mins=(startTs-now)/60000;
        const key='mkr.reminded.'+s.id+'.'+MKR.util.todayISO();
        if(mins>0 && mins<=60 && !localStorage.getItem(key)){
          localStorage.setItem(key,'1');
          N.fire('⏰ 上班提醒', `你 ${s.start} 的班约 ${Math.round(mins)} 分钟后开始`, 'rem-'+s.id);
        }
      }
    },
    _startShiftReminder(){ if(remTimer) return; N._checkShiftReminder(); remTimer=setInterval(()=>N._checkShiftReminder(), 60000); }
  };
  MKR.notify=N;
})();
