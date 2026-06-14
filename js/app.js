/* ===== 启动 ===== */
(async function(){
  MKR.net.init();

  // 恢复登录态(真实 Supabase 会话)
  const sess = await MKR.auth.restore();
  if(sess){
    await MKR.db.initSync();          // 已登录 → 拉云端(带鉴权)+ 订阅实时
    try{ await MKR.seed.ensure(); }catch(e){}
  }

  // 离职熔断「瞬间」生效：被设为离职 → 立即强制下线
  MKR.db.on('users', async ()=>{
    const s = MKR.auth.current(); if(!s) return;
    const u = await MKR.db.get('users', s.id);
    if(u && u.offboarded){ alert('您的账号已被设为离职，访问已熔断。'); MKR.auth.logout(); }
  });

  if(!location.hash) location.hash = sess ? `#/${sess.role}/${MKR.portals[sess.role].home}` : '#/login';
  MKR.router.render();

  window.MKR_RESET = MKR.seed.reset;
})();
