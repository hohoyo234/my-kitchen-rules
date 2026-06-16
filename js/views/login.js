/* ===== Login page (sign in, or apply for a new restaurant system) ===== */
window.MKR = window.MKR || {}; MKR.portals = MKR.portals || {};
(function(){
  const U = MKR.util;
  const QUICK = {owner:{u:'boss',p:'boss1111'}, manager:{u:'mgr',p:'mgr2222'}, staff:{u:'amy',p:'amy3333'}};

  MKR.portals.login = {
    async render(root){
      // Dynamic branding: show the active tenant's uploaded logo if one exists.
      let brand=null; try{ brand = await MKR.db.meta('brand'); }catch(e){}
      const logo = brand && brand.avatar
        ? `<div class="login-logo" style="overflow:hidden;padding:0"><img src="${brand.avatar}" alt="logo" style="width:100%;height:100%;object-fit:cover"></div>`
        : `<div class="login-logo">M</div>`;
      const brandName = (brand && brand.name) ? U.esc(brand.name) : 'My Kitchen Rules';

      root.innerHTML = `
      <div class="login-wrap">
        <div class="card login-card">
          ${MKR.i18n?MKR.i18n.switcher():''}
          <div class="row center gap8">${logo}
            <div><b style="font-size:18px">${brandName}</b><div class="faint" style="font-size:12.5px">Restaurant manager · Secure login</div></div></div>

          <div class="login-tabs mt16" id="loginTabs">
            <button data-tab="signin" class="active">Sign in</button>
            <button data-tab="apply">Apply for a new restaurant system</button>
          </div>

          <div id="signinPane">
            <div class="role-pick mt16" id="rolePick">
              <button data-r="owner" class="sel"><span class="em">👑</span>Owner</button>
              <button data-r="manager"><span class="em">📋</span>Manager</button>
              <button data-r="staff"><span class="em">🧑‍🍳</span>Staff</button>
            </div>

            <div class="field"><label>Username or ID</label><input class="input" id="lu" value="boss" autocomplete="username"></div>
            <div class="field"><label>Password</label><input class="input" id="lp" type="password" value="boss1111" autocomplete="current-password"></div>
            <div id="lerr" class="alert red hidden" style="margin-bottom:12px"></div>
            <button class="btn btn-dark btn-block" id="lbtn">Sign in</button>

            <div class="or-divider"><span>or</span></div>
            <button class="btn btn-ghost btn-block btn-google" id="gbtn">
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/></svg>
              Continue with Google
            </button>

            <div class="seed-hint">
              <b>Demo accounts (tap a role to fill):</b><br>
              👑 Owner <code>boss</code> / <code>boss1111</code><br>
              📋 Manager <code>mgr</code> / <code>mgr2222</code><br>
              🧑‍🍳 Staff <code>amy/kevin/leo</code> / <code>amy3333…</code><br>
              <span class="faint">Each account is separate and isolated by role; access is revoked instantly on offboarding.</span>
            </div>
          </div>

          <div id="applyPane" class="hidden"></div>
        </div>
      </div>`;

      if(MKR.i18n) MKR.i18n.bindSwitchers(root);

      // ----- Tab switching -----
      const tabs=U.qs('#loginTabs',root), signinPane=U.qs('#signinPane',root), applyPane=U.qs('#applyPane',root);
      U.qsa('button[data-tab]',tabs).forEach(b=> b.onclick=()=>{
        U.qsa('button[data-tab]',tabs).forEach(x=>x.classList.remove('active')); b.classList.add('active');
        const apply = b.dataset.tab==='apply';
        signinPane.classList.toggle('hidden', apply);
        applyPane.classList.toggle('hidden', !apply);
        if(apply && !applyPane.dataset.built){ buildApply(applyPane); applyPane.dataset.built='1'; }
      });

      // ----- Sign in -----
      const pick=U.qs('#rolePick',root), lu=U.qs('#lu',root), lp=U.qs('#lp',root), err=U.qs('#lerr',root), btn=U.qs('#lbtn',root);
      U.qsa('button[data-r]',pick).forEach(b=> b.onclick=()=>{
        U.qsa('button[data-r]',pick).forEach(x=>x.classList.remove('sel')); b.classList.add('sel');
        const role=b.dataset.r; lu.value=QUICK[role].u; lp.value=QUICK[role].p; err.classList.add('hidden');
      });
      function showErr(msg){ err.textContent='⚠️ '+msg; err.classList.remove('hidden'); }
      async function doLogin(){
        err.classList.add('hidden'); btn.disabled=true; btn.textContent='Signing in…';
        const res = await MKR.auth.login(lu.value, lp.value);
        if(!res.ok){ showErr(res.msg); btn.disabled=false; btn.textContent='Sign in'; return; }
        btn.textContent='Loading…';
        try{ await MKR.db.initSync(); await MKR.seed.ensure(); }catch(e){}
        try{ await MKR.features.load(); }catch(e){}
        try{ await MKR.notify.enable(); MKR.notify.start(res.user.role); }catch(e){}
        location.hash = `#/${res.user.role}/${MKR.portals[res.user.role].home}`;
      }
      btn.onclick=doLogin;
      lp.addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });

      const gbtn=U.qs('#gbtn',root);
      gbtn.onclick=async()=>{
        err.classList.add('hidden'); gbtn.disabled=true; gbtn.textContent='Redirecting to Google…';
        const res = await MKR.auth.loginWithGoogle();
        if(!res.ok){ showErr(res.msg || 'Google sign-in is not enabled for this project yet.'); gbtn.disabled=false; gbtn.innerHTML='Continue with Google'; }
      };
    }
  };

  // ===== New-restaurant application form (Business Owners only) =====
  function buildApply(pane){
    pane.innerHTML = `
      <div class="disclaimer mt16"><span>🏢</span>Apply to run your restaurant on My Kitchen. Only business owners may apply — a Super Admin reviews every request before your system is provisioned.</div>
      <div class="field"><label>Restaurant name</label><input class="input" id="a_name" placeholder="e.g. Golden Wok · Sydney"></div>
      <div class="field"><label>Restaurant address</label><input class="input" id="a_addr" placeholder="street, suburb, state"></div>
      <div class="field"><label>Website (optional)</label><input class="input" id="a_web" placeholder="https://…"></div>
      <div class="row">
        <div class="field grow"><label>Contact phone</label><input class="input" id="a_phone" inputmode="tel" placeholder="04XX XXX XXX"></div>
        <div class="field grow"><label>Contact email</label><input class="input" id="a_email" type="email" placeholder="name@example.com"></div>
      </div>
      <div class="row">
        <div class="field grow"><label>Opening time</label><input class="input" id="a_open" type="time" value="09:00"></div>
        <div class="field grow"><label>Closing time</label><input class="input" id="a_close" type="time" value="22:00"></div>
      </div>
      <div class="section-title mt8">Owner login (for after approval)</div>
      <div class="row">
        <div class="field grow"><label>Choose a username</label><input class="input" id="a_user" autocomplete="off" placeholder="e.g. goldenwok"></div>
        <div class="field grow"><label>Choose a password</label><input class="input" id="a_pass" type="password" autocomplete="new-password" placeholder="min 6 characters"></div>
      </div>
      <div id="aerr" class="alert red hidden" style="margin-bottom:12px"></div>
      <button class="btn btn-accent btn-block" id="abtn">📩 Submit application</button>`;

    const err=U.qs('#aerr',pane);
    const showErr=(m)=>{ err.textContent='⚠️ '+m; err.classList.remove('hidden'); };
    const v=(id)=>U.qs('#'+id,pane).value.trim();

    U.qs('#abtn',pane).onclick=async()=>{
      err.classList.add('hidden');
      const name=v('a_name'), addr=v('a_addr'), phone=v('a_phone'), email=v('a_email');
      const username=v('a_user').toLowerCase().replace(/\s+/g,''), pass=U.qs('#a_pass',pane).value;
      if(!name){ return showErr('Please enter the restaurant name'); }
      if(!addr){ return showErr('Please enter the restaurant address'); }
      if(!phone){ return showErr('Please enter a contact phone'); }
      if(!email){ return showErr('Please enter a contact email'); }
      if(username.length<3){ return showErr('Username must be at least 3 characters'); }
      if(pass.length<6){ return showErr('Password must be at least 6 characters'); }

      const btn=U.qs('#abtn',pane); btn.disabled=true; btn.textContent='Submitting…';

      // 1) Create the owner's login account now (Supabase). Login stays blocked until
      //    a Super Admin approves (no profile row yet → auth refuses the session).
      let ownerUid=null, authMsg='';
      if(MKR.supa.signupClient){
        try{
          const {data,error}=await MKR.supa.signupClient.auth.signUp({email:MKR.supa.emailFor(username), password:pass});
          if(data&&data.user) ownerUid=data.user.id;
          else if(error){ authMsg=error.message; }
          await MKR.supa.signupClient.auth.signOut().catch(()=>{});
        }catch(e){ authMsg=e.message||String(e); }
        if(!ownerUid && /regist|exist/i.test(authMsg||'')){ btn.disabled=false; btn.textContent='📩 Submit application'; return showErr('That username is already taken — pick another'); }
      }

      // 2) Record the application (pending) for the Super Admin to review.
      const kitchenId='k_'+(ownerUid?ownerUid.slice(0,8):Math.random().toString(36).slice(2,10));
      await MKR.db.put('kitchens', {
        id:kitchenId, name, location:addr, status:'pending', primary:false,
        ownerUid, ownerUsername:username, onboardedOwner:false, via:'application',
        application:{ address:addr, website:v('a_web'), phone, email, hours:{open:v('a_open'),close:v('a_close')}, name, username, submittedAt:Date.now() },
        createdAt:Date.now()
      });

      // 3) Notify the Super Admin (in-app alert + push if available).
      await MKR.db.put('alerts', {type:'application', level:'amber', title:'New restaurant application',
        desc:`${name} applied to join — ${addr} · ${phone}`, read:false, ts:Date.now()});
      try{ if(MKR.notify&&MKR.notify.push) MKR.notify.push({role:'owner'}, '🏢 New restaurant application', name+' — '+addr, 'application'); }catch(e){}

      // 4) Success
      pane.innerHTML = `
        <div class="alert green mt16"><span>✅</span><div><b>Application submitted!</b><br>Your request for <b>${U.esc(name)}</b> has been sent to the Super Admin for review.</div></div>
        <div class="card" style="padding:16px 18px;margin-top:12px">
          <div class="li" style="border:none;padding:4px 0"><div class="meta"><span>Your login username</span><b>${U.esc(username)}</b></div></div>
          <div class="li" style="border:none;padding:4px 0"><div class="meta"><span>Status</span><b style="color:var(--amber)">Pending approval</b></div></div>
        </div>
        <p class="muted mt12" style="font-size:13px">Once approved, sign in with the username and password you chose to finish setting up your restaurant (logo + features).</p>
        ${authMsg && !ownerUid ? `<div class="alert amber mt12"><span>⚠️</span><div>Note: ${U.esc(authMsg)} — your application was still recorded; the Super Admin can provision your login on approval.</div></div>`:''}`;
    };
  }
})();
