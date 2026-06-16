/* ===== Notification center + PWA / background push =====
   - Online notifications: owner gets red alerts, staff get SOS shifts, staff get
     a 1-hour-before shift nudge (in-app + system notification).
   - PWA: registers a Service Worker, supports "add to home screen", offline shell.
   - Background push: subscribes to Web Push, stores it in push_subscriptions; an
     Edge Function + pg_cron can push even when the app is closed (report / nudge).
     With no backend it silently degrades to online notifications.
   - Delivery state: after a nudge is delivered it writes back shift.remindedAt so
     the manager can see "reminded".
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

    // Register the Service Worker (PWA + background-push base)
    async registerSW(){
      if(!('serviceWorker' in navigator)) return null;
      try{ return await navigator.serviceWorker.register('sw.js'); }catch(e){ return null; }
    },

    // Subscribe to Web Push, store it in push_subscriptions (for the Edge Function to push)
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
      }catch(e){ /* backend table/function not ready → silently degrade to online notifications */ }
    },

    // Call the Edge Function to push proactively (received even when the app is closed); fails silently if not deployed
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
      N.subscribePush();   // non-blocking
      try{ (await MKR.db.getAll('alerts')).forEach(a=>seenAlerts.add(a.id)); }catch(e){}
      try{ (await MKR.db.getAll('sos')).forEach(s=>seenSos.add(s.id)); }catch(e){}

      if(role==='owner'){
        MKR.db.on('alerts', async ()=>{
          for(const a of await MKR.db.getAll('alerts')){
            if(!seenAlerts.has(a.id)){ seenAlerts.add(a.id); if(!a.read) N.fire((a.level==='red'?'🚨 ':'🔔 ')+(a.title||'Critical alert'), a.desc||'', 'al-'+a.id); }
          }
        });
      }
      if(role==='staff'){
        MKR.db.on('sos', async ()=>{
          for(const s of await MKR.db.getAll('sos')){
            if(!seenSos.has(s.id)){ seenSos.add(s.id); if(s.status==='open'&&!s.claimedBy) N.fire('🆘 Urgent cover needed', (s.title||'')+' · reward '+(s.reward||''), 'sos-'+s.id); }
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
          N.fire('⏰ Shift reminder', `Your ${s.start} shift starts in about ${Math.round(mins)} min`, 'rem-'+s.id);
          // Delivery state: write back so the manager sees "reminded"
          try{ await MKR.db.put('shifts',{id:s.id, remindedAt:now}); }catch(e){}
        }
      }
    },
    _startShiftReminder(){ if(remTimer) return; N._checkShiftReminder(); remTimer=setInterval(()=>N._checkShiftReminder(), 60000); }
  };
  MKR.notify=N;
})();
