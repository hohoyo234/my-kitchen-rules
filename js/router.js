/* ===== 哈希路由 + 应用外壳 ===== */
window.MKR = window.MKR || {};
(function(){
  const U = ()=>MKR.util;

  function parse(){
    const h = (location.hash||'').replace(/^#\/?/,''); // e.g. owner/team/u_amy
    const [role, section, arg] = h.split('/');
    return { role: role||'', section: section||'', arg: arg||'' };
  }

  async function render(){
    const root = document.getElementById('root');
    let { role, section, arg } = parse();

    // 顾客端公开路由(免登录):#/order/<桌号>
    if(role==='order'){ return MKR.customer.render(root, section); }

    const sess = MKR.auth.current();

    // 未登录 → 登录页
    if(role==='login' || !sess){
      if(role!=='login' && sess){ /* keep */ } else { return MKR.portals.login.render(root); }
    }
    if(!sess){ return MKR.portals.login.render(root); }

    // 角色守卫：非老板必须访问自己的端；老板是超级管理员可查看任意端
    const viewingRole = role || sess.role;
    if(viewingRole!==sess.role && sess.role!=='owner'){ location.hash = `#/${sess.role}/${MKR.portals[sess.role].home}`; return; }
    const portal = MKR.portals[viewingRole]; if(!portal){ location.hash=`#/${sess.role}/${MKR.portals[sess.role].home}`; return; }
    if(!section){ location.hash = `#/${viewingRole}/${portal.home}`; return; }

    await shell(root, portal, sess, section, arg, viewingRole);
  }

  async function shell(root, portal, sess, section, arg, viewingRole){
    viewingRole = viewingRole || sess.role;
    const preview = viewingRole!==sess.role;   // 老板预览其它端
    // 按功能开关/权限过滤可见导航(用所查看端的角色判断;老板直通)
    const can = (n)=> !n.feature || (MKR.features && MKR.features.can(n.feature, sess.role==='owner'?'owner':viewingRole));
    const visNav = portal.nav.filter(can);

    // 守卫:直接访问被关闭/无权限的功能 → 退回首页
    const target = portal.nav.find(n=>n.id===section);
    if(target && !can(target)){ MKR.util.toast('该功能已被关闭或无权限','amber'); location.hash=`#/${viewingRole}/${portal.home}`; return; }

    // 计算导航徽标（如未读警报数）
    const badges = portal.badges ? await portal.badges() : {};
    const nav = visNav.map(n=>{
      const active = n.id===section ? 'active':'';
      const badge = badges[n.id] ? `<span class="badge">${badges[n.id]}</span>`:'';
      return `<a class="nav-item ${active}" href="#/${viewingRole}/${n.id}"><span class="em">${n.em}</span>${n.label}${badge}</a>`;
    }).join('');

    const mobileNav = visNav.slice(0,5).map(n=>{
      const active = n.id===section ? 'active':'';
      return `<a class="${active}" href="#/${viewingRole}/${n.id}"><span class="em">${n.em}</span>${n.short||n.label}</a>`;
    }).join('');

    const cur = portal.nav.find(n=>n.id===section) || visNav[0] || portal.nav[0];

    root.innerHTML = `
      <div class="shell">
        <aside class="sidebar">
          <div class="side-brand"><div class="logo">M</div><div><b>My Kitchen</b><small>${MKR.auth.roleName(viewingRole)}端</small></div></div>
          ${nav}
          <div class="side-foot">
            <div class="who" style="margin-bottom:10px"><div class="ava">${sess.emoji||MKR.util.initials(sess.name)}</div><div><b style="font-size:14px">${MKR.util.esc(sess.name)}</b><div class="faint" style="font-size:11.5px">${MKR.auth.roleName(sess.role)}${preview?' · 预览'+MKR.auth.roleName(viewingRole)+'端':''}</div></div></div>
            <button class="btn btn-ghost btn-sm btn-block" id="logoutBtn">退出登录</button>
          </div>
        </aside>
        <div class="main">
          <div id="offbar" class="offbar hidden">⚠️ 网络已断开 · 系统已进入本地保护模式，可放心继续操作，恢复后自动同步</div>
          ${preview?`<div class="offbar" style="background:var(--blue-soft);color:var(--blue);border-color:#c4d6f3">👁 老板预览 · ${MKR.auth.roleName(viewingRole)}端 &nbsp;<a href="#/owner/switch" style="text-decoration:underline;font-weight:700">返回老板端 →</a></div>`:''}
          <div class="topbar">
            <div><h1>${cur.label}</h1><div class="sub">${MKR.util.esc(portal.subtitle||'')}</div></div>
            <div id="netlight" class="netlight online"><span class="lamp"></span>已连接</div>
          </div>
          <div class="content" id="view"></div>
        </div>
        <nav class="mobile-nav">${mobileNav}</nav>
      </div>`;

    document.getElementById('logoutBtn').onclick = ()=>{
      if(MKR.net.isDirty() && !confirm('有未保存的数据，确定退出？')) return;
      MKR.auth.logout();
    };
    MKR.net.render();
    const view = document.getElementById('view');
    try{ await portal.view(section, view, arg, viewingRole); }
    catch(e){ console.error(e); view.innerHTML = `<div class="empty"><div class="em">😵</div><p>页面出错：${MKR.util.esc(e.message)}</p></div>`; }
  }

  MKR.router = { render, parse,
    go(section){ const s=MKR.auth.current(); if(s) location.hash=`#/${s.role}/${section}`; },
    refresh(){ render(); }
  };
  window.addEventListener('hashchange', render);
})();
