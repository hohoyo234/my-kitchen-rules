/* ===== Login / session / roles =====
   SECURITY MODEL (production):
   - Authentication is Supabase Auth. Passwords are hashed server-side by
     Supabase (bcrypt) and are NEVER stored by this app. There is no password
     constant anywhere in the code, and no plaintext-password table lookup.
   - Authorisation comes from the SERVER: every signed-in user has a row in the
     `profiles` table (id = auth.uid()) that holds their role / kitchen / staff_id.
     The browser's cached copy is only a UI hint — Row Level Security re-checks
     the user's real identity on every query, so editing localStorage to claim a
     different role grants NOTHING (the database refuses the data).
   See supabase/security-setup.sql and SECURITY.md.
*/
window.MKR = window.MKR || {};
(function(){
  const LS = 'mkr.localsess';                  // cached profile (UI hint only — never trusted for access)
  const SUPER_EMAIL = (MKR.supa && MKR.supa.SUPER_ADMIN_EMAIL) || 'hyy7010@gmail.com';
  const EMO = {superadmin:'🛡️', owner:'👑', manager:'📋', staff:'🧑‍🍳'};

  const Auth = {
    _profile: null,
    _realProfile: null,                        // saved while a Super Admin impersonates
    current(){ return this._profile; },
    isRole(r){ return this._profile && this._profile.role===r; },
    roleName(r){ return {superadmin:'Super Admin', owner:'Owner', manager:'Manager', staff:'Staff'}[r]||r; },
    isSuperAdmin(){ return this._profile && this._profile.role==='superadmin'; },

    _cache(p){ try{ localStorage.setItem(LS, JSON.stringify(p)); }catch(e){} this._profile=p; return p; },
    _clearCache(){ try{ localStorage.removeItem(LS); }catch(e){} },

    // ---- Build the session profile from the SERVER-trusted profiles row ----
    //  Returns null (and signs the user back out) when there is no active profile.
    //  Identity / role / kitchen all come from `profiles`, never from the client.
    async _loadProfile(authUser){
      if(!authUser || !MKR.supa.client) return null;
      const {data} = await MKR.supa.client.from('profiles').select('*').eq('id', authUser.id).limit(1);
      const p = data && data[0];
      if(!p || p.active===false){
        // No role assigned (e.g. a Google sign-in that was never invited / approved)
        // or a deactivated (offboarded) account → refuse and sign back out.
        try{ if(!p) sessionStorage.setItem('mkr.authmsg','no-invite'); }catch(e){}
        try{ await MKR.supa.client.auth.signOut(); }catch(e){}
        this._profile=null; this._clearCache(); return null;
      }
      return this._cache({
        id: p.staff_id || p.id,           // the app's business id (sess.id), e.g. u_amy
        uid: authUser.id,                 // the auth.uid() — what RLS actually checks
        name: p.name, role: p.role,
        emoji: p.emoji || EMO[p.role] || '',
        username: p.username,
        kitchenId: p.kitchen_id || 'k_main'
      });
    },

    // ---- Restore on startup: trust the Supabase session, not the cache ----
    async restore(){
      if(!MKR.supa.client){ this._clearCache(); return null; }
      try{
        const {data} = await MKR.supa.client.auth.getSession();
        if(data && data.session){
          // Show the cached profile instantly for a snappy first paint, then
          // re-validate against the server (authoritative) in the background.
          try{ const raw=localStorage.getItem(LS); if(raw) this._profile=JSON.parse(raw); }catch(e){}
          return await this._loadProfile(data.session.user);
        }
      }catch(e){}
      // No valid Supabase session → not logged in. Drop any stale/tampered cache.
      this._clearCache(); this._profile=null; return null;
    },

    // ---- Sign in (Supabase Auth only) ----
    async login(identifier, password){
      if(!MKR.supa.client) return {ok:false, msg:'Secure sign-in is unavailable (cloud not connected).'};
      const email = MKR.supa.emailFor(identifier);
      const {data, error} = await MKR.supa.client.auth.signInWithPassword({email, password});
      if(error){
        const m = /confirm/i.test(error.message||'') ? 'Please confirm your email first, then sign in.'
                : 'Wrong username/email or password';
        return {ok:false, msg:m};
      }
      const prof = await this._loadProfile(data.user);
      if(!prof) return {ok:false, msg:'This account has no role assigned yet, or has been deactivated. Ask an owner/admin to approve it.'};
      MKR.audit.log({action:'login', desc:`${prof.name} signed in (${this.roleName(prof.role)})`});
      return {ok:true, user:prof};
    },

    // ---- Super Admin impersonation (view a kitchen as owner/manager/staff) ----
    //  The super admin's real JWT is still what talks to the database, so RLS
    //  (is_super) keeps letting them through; this only reskins the UI.
    impersonate(role, kitchenId, name){
      if(!this.isSuperAdmin() && !(this._realProfile && this._realProfile.role==='superadmin')) return this._profile;
      if(!this._realProfile) this._realProfile = this._profile;
      this._profile = { id:this._realProfile.id, uid:this._realProfile.uid, name: name||('Preview · '+this.roleName(role)),
        role, emoji: EMO[role]||'🛡️', kitchenId: kitchenId||'k_main', _impersonating:true };
      return this._profile;
    },
    exitImpersonate(){ if(this._realProfile){ this._profile=this._realProfile; this._realProfile=null; this._cache(this._profile); } },

    // ---- Owner switches the active branch (tenant) for this session ----
    //  RLS still scopes data to my_kitchen() server-side; this updates the hint.
    switchKitchen(kitchenId){ if(!this._profile||!kitchenId) return; this._profile.kitchenId=kitchenId; this._cache(this._profile); return this._profile; },

    // ---- Continue with Google (invite-only: a profiles row must already exist) ----
    async loginWithGoogle(){
      if(!MKR.supa.client) return {ok:false, msg:'Cloud not connected'};
      try{
        const redirectTo = location.origin + location.pathname;
        const {error} = await MKR.supa.client.auth.signInWithOAuth({ provider:'google', options:{ redirectTo } });
        if(error) return {ok:false, msg: error.message };
        return {ok:true, redirecting:true};
      }catch(e){ return {ok:false, msg: e.message || 'Google sign-in unavailable'}; }
    },

    async logout(){
      this._clearCache(); this._realProfile=null;
      try{ if(MKR.supa.client) await MKR.supa.client.auth.signOut(); }catch(e){}
      this._profile=null; location.hash='#/login'; location.reload();
    }
  };
  MKR.auth = Auth;
})();
