/* ===== Login page (username + password, or Google) ===== */
window.MKR = window.MKR || {}; MKR.portals = MKR.portals || {};
(function(){
  const U = MKR.util;
  const QUICK = {owner:{u:'boss',p:'boss1111'}, manager:{u:'mgr',p:'mgr2222'}, staff:{u:'amy',p:'amy3333'}};

  MKR.portals.login = {
    render(root){
      let role='owner';
      root.innerHTML = `
      <div class="login-wrap">
        <div class="card login-card">
          ${MKR.i18n?MKR.i18n.switcher():''}
          <div class="row center gap8"><div class="login-logo">M</div>
            <div><b style="font-size:18px">My Kitchen Rules</b><div class="faint" style="font-size:12.5px">Restaurant manager · Secure login</div></div></div>

          <div class="role-pick mt24" id="rolePick">
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
      </div>`;

      if(MKR.i18n) MKR.i18n.bindSwitchers(root);
      const pick=U.qs('#rolePick',root), lu=U.qs('#lu',root), lp=U.qs('#lp',root), err=U.qs('#lerr',root), btn=U.qs('#lbtn',root);
      U.qsa('button[data-r]',pick).forEach(b=> b.onclick=()=>{
        U.qsa('button[data-r]',pick).forEach(x=>x.classList.remove('sel')); b.classList.add('sel');
        role=b.dataset.r; lu.value=QUICK[role].u; lp.value=QUICK[role].p; err.classList.add('hidden');
      });

      function showErr(msg){ err.textContent='⚠️ '+msg; err.classList.remove('hidden'); }

      async function doLogin(){
        err.classList.add('hidden'); btn.disabled=true; btn.textContent='Signing in…';
        const res = await MKR.auth.login(lu.value, lp.value);
        if(!res.ok){ showErr(res.msg); btn.disabled=false; btn.textContent='Sign in'; return; }
        btn.textContent='Loading…';
        try{ await MKR.db.initSync(); await MKR.seed.ensure(); }catch(e){}
        try{ await MKR.features.load(); }catch(e){}
        try{ await MKR.notify.enable(); MKR.notify.start(res.user.role); }catch(e){}  // ask for notification permission inside the click gesture
        location.hash = `#/${res.user.role}/${MKR.portals[res.user.role].home}`;
      }
      btn.onclick=doLogin;
      lp.addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });

      const gbtn=U.qs('#gbtn',root);
      gbtn.onclick=async()=>{
        err.classList.add('hidden'); gbtn.disabled=true; gbtn.textContent='Redirecting to Google…';
        const res = await MKR.auth.loginWithGoogle();
        if(!res.ok){ showErr(res.msg || 'Google sign-in is not enabled for this project yet.'); gbtn.disabled=false; gbtn.innerHTML='Continue with Google'; }
        // on success the browser navigates away to Google's consent screen
      };
    }
  };
})();
