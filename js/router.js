/* ===== Hash router + app shell ===== */
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

    // Public customer route (no login): #/order/<table>
    if(role==='order'){ return MKR.customer.render(root, section); }

    const sess = MKR.auth.current();

    // Not signed in → login page
    if(role==='login' || !sess){
      if(role!=='login' && sess){ /* keep */ } else { return MKR.portals.login.render(root); }
    }
    if(!sess){ return MKR.portals.login.render(root); }

    // Role guard: non-owners must stay in their own portal; the owner (super admin) can view any portal
    const viewingRole = role || sess.role;
    if(viewingRole!==sess.role && sess.role!=='owner'){ location.hash = `#/${sess.role}/${MKR.portals[sess.role].home}`; return; }
    const portal = MKR.portals[viewingRole]; if(!portal){ location.hash=`#/${sess.role}/${MKR.portals[sess.role].home}`; return; }
    if(!section){ location.hash = `#/${viewingRole}/${portal.home}`; return; }

    await shell(root, portal, sess, section, arg, viewingRole);
  }

  async function shell(root, portal, sess, section, arg, viewingRole){
    viewingRole = viewingRole || sess.role;
    const preview = viewingRole!==sess.role;   // owner previewing another portal
    // Filter visible nav by feature switches / permissions (judged by the viewed portal's role; owner passes through)
    const can = (n)=> !n.feature || (MKR.features && MKR.features.can(n.feature, sess.role==='owner'?'owner':viewingRole));
    const visNav = portal.nav.filter(can);

    // Guard: directly visiting a disabled / unauthorized feature → back to home
    const target = portal.nav.find(n=>n.id===section);
    if(target && !can(target)){ MKR.util.toast('That feature is turned off or not permitted','amber'); location.hash=`#/${viewingRole}/${portal.home}`; return; }

    // Compute nav badges (e.g. unread alert count)
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
          <div class="side-brand"><div class="logo">M</div><div><b>My Kitchen</b><small>${MKR.auth.roleName(viewingRole)}</small></div></div>
          ${nav}
          <div class="side-foot">
            <div class="who" style="margin-bottom:10px"><div class="ava">${sess.emoji||MKR.util.initials(sess.name)}</div><div><b style="font-size:14px">${MKR.util.esc(sess.name)}</b><div class="faint" style="font-size:11.5px">${MKR.auth.roleName(sess.role)}${preview?' · previewing '+MKR.auth.roleName(viewingRole):''}</div></div></div>
            <button class="btn btn-ghost btn-sm btn-block" id="logoutBtn">Log out</button>
          </div>
        </aside>
        <div class="main">
          <div id="offbar" class="offbar hidden">⚠️ Network lost · running in offline-safe mode — keep working, it will sync automatically when back online</div>
          ${preview?`<div class="offbar" style="background:var(--blue-soft);color:var(--blue);border-color:#c4d6f3">👁 Owner preview · ${MKR.auth.roleName(viewingRole)} &nbsp;<a href="#/owner/switch" style="text-decoration:underline;font-weight:700">Back to Owner →</a></div>`:''}
          <div class="topbar">
            <div><h1>${cur.label}</h1><div class="sub">${MKR.util.esc(portal.subtitle||'')}</div></div>
            <div id="netlight" class="netlight online"><span class="lamp"></span>Connected</div>
          </div>
          <div class="content" id="view"></div>
        </div>
        <nav class="mobile-nav">${mobileNav}</nav>
      </div>`;

    document.getElementById('logoutBtn').onclick = ()=>{
      if(MKR.net.isDirty() && !confirm('You have unsaved data — log out anyway?')) return;
      MKR.auth.logout();
    };
    MKR.net.render();
    const view = document.getElementById('view');
    try{ await portal.view(section, view, arg, viewingRole); }
    catch(e){ console.error(e); view.innerHTML = `<div class="empty"><div class="em">😵</div><p>Page error: ${MKR.util.esc(e.message)}</p></div>`; }
  }

  MKR.router = { render, parse,
    go(section){ const s=MKR.auth.current(); if(s) location.hash=`#/${s.role}/${section}`; },
    refresh(){ render(); }
  };
  window.addEventListener('hashchange', render);
})();
