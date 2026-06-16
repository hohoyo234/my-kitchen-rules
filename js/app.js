/* ===== 启动 ===== */
(async function(){
  MKR.net.init();
  MKR.notify.registerSW();          // 注册 Service Worker(PWA + 离线外壳 + 后台推送)

  // 恢复登录态(真实 Supabase 会话)
  const sess = await MKR.auth.restore();
  if(sess){
    await MKR.db.initSync();          // 已登录 → 拉云端(带鉴权)+ 订阅实时
    try{ await MKR.seed.ensure(); }catch(e){}
    try{ await MKR.features.load(); }catch(e){}   // 加载功能开关/权限
    MKR.notify.start(sess.role);      // 通知/催班监听
  }

  // 离职熔断「瞬间」生效：被设为离职 → 立即强制下线
  MKR.db.on('users', async ()=>{
    const s = MKR.auth.current(); if(!s) return;
    const u = await MKR.db.get('users', s.id);
    if(u && u.offboarded){ alert('您的账号已被设为离职，访问已熔断。'); MKR.auth.logout(); }
  });

  if(!location.hash) location.hash = sess ? `#/${sess.role}/${MKR.portals[sess.role].home}` : '#/login';
  MKR.router.render();

  // 双语:启动自动翻译 + 浮动语言切换按钮
  try{ MKR.i18n.start(); }catch(e){}
  (function mountLang(){
    if(document.getElementById('langToggle')) return;
    const b=document.createElement('button'); b.id='langToggle'; b.className='lang-toggle';
    b.textContent = (MKR.i18n.lang==='en') ? '🌐 中文' : '🌐 EN';
    b.onclick=()=> MKR.i18n.toggle();
    document.body.appendChild(b);
  })();

  window.MKR_RESET = MKR.seed.reset;
})();
