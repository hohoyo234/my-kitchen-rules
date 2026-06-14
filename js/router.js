/* ===== 哈希路由 + 应用外壳 ===== */
window.MKR = window.MKR || {};
(function(){
  const U = ()=>MKR.util;

  function parse(){
    const h = (location.hash||'').replace(/^#\/?/,''); // e.g. owner/dashboard
    const [role, section] = h.split('/');
    return { role: role||'', section: section||'' };
  }

  async function render(){
    const root = document.getElementById('root');
    const sess = MKR.auth.current();
    let { role, section } = parse();

    // 未登录 → 登录页
    if(role==='login' || !sess){
      if(role!=='login' && sess){ /* keep */ } else { return MKR.portals.login.render(root); }
    }
    if(!sess){ return MKR.portals.login.render(root); }

    // 角色守卫：URL 角色必须与登录角色一致
    if(role!==sess.role){ location.hash = `#/${sess.role}/${MKR.portals[sess.role].home}`; return; }
    const portal = MKR.portals[sess.role];
    if(!section){ location.hash = `#/${sess.role}/${portal.home}`; return; }

    await shell(root, portal, sess, section);
  }

  async function shell(root, portal, sess, section){
    // 计算导航徽标（如未读警报数）
    const badges = portal.badges ? await portal.badges() : {};
    const nav = portal.nav.map(n=>{
      const active = n.id===section ? 'active':'';
      const badge = badges[n.id] ? `<span class="badge">${badges[n.id]}</span>`:'';
      return `<a class="nav-item ${active}" href="#/${sess.role}/${n.id}"><span class="em">${n.em}</span>${n.label}${badge}</a>`;
    }).join('');

    const mobileNav = portal.nav.slice(0,5).map(n=>{
      const active = n.id===section ? 'active':'';
      return `<a class="${active}" href="#/${sess.role}/${n.id}"><span class="em">${n.em}</span>${n.short||n.label}</a>`;
    }).join('');

    const cur = portal.nav.find(n=>n.id===section) || portal.nav[0];

    root.innerHTML = `
      <div class="shell">
        <aside class="sidebar">
          <div class="side-brand"><div class="logo">M</div><div><b>My Kitchen</b><small>${MKR.auth.roleName(sess.role)}端</small></div></div>
          ${nav}
          <div class="side-foot">
            <div class="who" style="margin-bottom:10px"><div class="ava">${sess.emoji||MKR.util.initials(sess.name)}</div><div><b style="font-size:14px">${MKR.util.esc(sess.name)}</b><div class="faint" style="font-size:11.5px">${MKR.auth.roleName(sess.role)}</div></div></div>
            <button class="btn btn-ghost btn-sm btn-block" id="logoutBtn">退出登录</button>
          </div>
        </aside>
        <div class="main">
          <div id="offbar" class="offbar hidden">⚠️ 网络已断开 · 系统已进入本地保护模式，可放心继续操作，恢复后自动同步</div>
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
    try{ await portal.view(section, view); }
    catch(e){ console.error(e); view.innerHTML = `<div class="empty"><div class="em">😵</div><p>页面出错：${MKR.util.esc(e.message)}</p></div>`; }
  }

  MKR.router = { render, parse,
    go(section){ const s=MKR.auth.current(); if(s) location.hash=`#/${s.role}/${section}`; },
    refresh(){ render(); }
  };
  window.addEventListener('hashchange', render);
})();
