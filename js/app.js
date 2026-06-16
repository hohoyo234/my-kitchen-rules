/* ===== Boot ===== */
(async function(){
  MKR.net.init();
  MKR.notify.registerSW();          // register the Service Worker (PWA + offline shell + background push)

  // Restore the login session (real Supabase session)
  const sess = await MKR.auth.restore();
  if(sess){
    await MKR.db.initSync();          // signed in → pull from cloud (authed) + subscribe to realtime
    try{ await MKR.seed.ensure(); }catch(e){}
    try{ await MKR.features.load(); }catch(e){}   // load feature switches / permissions
    MKR.notify.start(sess.role);      // notifications / shift nudges
  }

  // Offboard cut-off takes effect instantly: set to offboarded → forced sign-out
  MKR.db.on('users', async ()=>{
    const s = MKR.auth.current(); if(!s) return;
    const u = await MKR.db.get('users', s.id);
    if(u && u.offboarded){ alert('Your account has been offboarded — access has been cut off.'); MKR.auth.logout(); }
  });

  if(!location.hash) location.hash = sess ? `#/${sess.role}/${MKR.portals[sess.role].home}` : '#/login';
  MKR.router.render();

  window.MKR_RESET = MKR.seed.reset;
})();
