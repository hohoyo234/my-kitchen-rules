/* ===== 通知中心 + PWA/后台推送 =====
   - 在线通知:老板收红色警报、员工收 SOS、员工上班前 1 小时催班(应用内 + 系统通知)
   - PWA:注册 Service Worker,可"添加到主屏幕",离线外壳可用
   - 后台推送:订阅 Web Push,把订阅存 push_subscriptions;Edge Function + pg_cron 在
     "关掉 App 时"也能推送(日报/催班)。无后端时自动降级为在线通知,不报错。
   - 送达状态:催班送达后回写 shift.remindedAt,经理可见「已提醒」。
*/
window.MKR = window.MKR || {};
(function(){
  let started=false, remTimer=null;
  const seenAlerts=new Set(), seenSos=new Set();

  function urlB64ToUint8(b64){
    const pad='='.repeat((4-b64.length%4)%4);
    const base=(b64+pad).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(base); return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
  }

  const N = {
    supported: ('Notification' in window),
    granted(){ return N.supported && Notification.permission==='granted'; },

    async enable(){ if(!N.supported) return false; try{ return (await Notification.requestPermission())==='granted'; }catch(e){ return false; } },

    fire(title, body, tag){
      if(N.granted()){
        if(navigator.serviceWorker && navigator.serviceWorker.ready){
          navigator.serviceWorker.ready.then(reg=>reg.showNotification(title,{body:body||'',tag,icon:'assets/icon.svg',badge:'assets/icon.svg'})).catch(()=>{ try{ new Notification(title,{body:body||'',tag}); }catch(e){} });
        } else { try{ new Notification(title,{body:body||'',tag}); }catch(e){} }
      }
      MKR.util.toast(body? (title+' · '+body) : title);
    },

    // 注册 Service Worker(PWA + 后台推送基础)
    async registerSW(){
      if(!('serviceWorker' in navigator)) return null;
      try{ return await navigator.serviceWorker.register('sw.js'); }catch(e){ return null; }
    },

    // 订阅 Web Push,把订阅存到 push_subscriptions(供 Edge Function 推送)
    async subscribePush(){
      try{
        if(!('serviceWorker' in navigator) || !('PushManager' in window) || !N.granted()) return;
        if(!MKR.supa || !MKR.supa.client || !MKR.supa.VAPID_PUBLIC) return;
        const reg=await navigator.serviceWorker.ready;
        let sub=await reg.pushManager.getSubscription();
        if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:urlB64ToUint8(MKR.supa.VAPID_PUBLIC)});
        const j=sub.toJSON(); const sess=MKR.auth.current(); if(!sess) return;
        await MKR.supa.client.from('push_subscriptions').upsert({
          endpoint:j.endpoint, p256dh:j.keys.p256dh, auth:j.keys.auth,
          staff_id:sess.id, role:sess.role, user_uid:sess.uid
        }, {onConflict:'endpoint'});
      }catch(e){ /* 后端表/函数未就绪时静默降级为在线通知 */ }
    },

    // 调 Edge Function 主动推送(关掉 App 也能收);函数未部署时静默失败
    async push(target, title, body, tag){
      try{
        if(!MKR.supa || !MKR.supa.client) return;
        const {data}=await MKR.supa.client.auth.getSession();
        if(!data || !data.session) return;
        await fetch(`${MKR.supa.URL}/functions/v1/send-push`, {
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+data.session.access_token},
          body:JSON.stringify({mode:'direct', target, title, body, tag})
        });
      }catch(e){}
    },

    async start(role){
      if(started) return; started=true;
      await N.registerSW();
      N.subscribePush();   // 不阻塞
      try{ (await MKR.db.getAll('alerts')).forEach(a=>seenAlerts.add(a.id)); }catch(e){}
      try{ (await MKR.db.getAll('sos')).forEach(s=>seenSos.add(s.id)); }catch(e){}

      if(role==='owner'){
        MKR.db.on('alerts', async ()=>{
          for(const a of await MKR.db.getAll('alerts')){
            if(!seenAlerts.has(a.id)){ seenAlerts.add(a.id); if(!a.read) N.fire((a.level==='red'?'🚨 ':'🔔 ')+(a.title||'异常警报'), a.desc||'', 'al-'+a.id); }
          }
        });
      }
      if(role==='staff'){
        MKR.db.on('sos', async ()=>{
          for(const s of await MKR.db.getAll('sos')){
            if(!seenSos.has(s.id)){ seenSos.add(s.id); if(s.status==='open'&&!s.claimedBy) N.fire('🆘 紧急顶班', (s.title||'')+' · 奖励 '+(s.reward||''), 'sos-'+s.id); }
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
          // 送达状态:回写,让经理看到「已提醒」
          try{ await MKR.db.put('shifts',{id:s.id, remindedAt:now}); }catch(e){}
        }
      }
    },
    _startShiftReminder(){ if(remTimer) return; N._checkShiftReminder(); remTimer=setInterval(()=>N._checkShiftReminder(), 60000); }
  };
  MKR.notify=N;
})();
