/* ===== Login / session / roles =====
   Two paths, tried in order by login():
   1. Local-first accounts — stored in the `users` table with a demo `pw`. This
      covers the Super Admin (hyy7010@gmail.com), registered restaurant owners,
      managers who joined via a link, and the seeded demo accounts. Works fully
      offline / without provisioning anything in Supabase. The session is kept in
      localStorage('mkr.localsess').
   2. Supabase Auth fallback — for any real cloud accounts (kept for the future
      Google path). RLS enforces role isolation at the database layer.
*/
window.MKR = window.MKR || {};
(function(){
  const LS = 'mkr.localsess';
  const SUPER_EMAIL = (MKR.supa && MKR.supa.SUPER_ADMIN_EMAIL) || 'hyy7010@gmail.com';
  const SUPER_PW = 'admin1234';               // demo Super Admin password
  const EMO = {superadmin:'🛡️', owner:'👑', manager:'📋', staff:'🧑‍🍳'};

  const Auth = {
    _profile: null,
    _realProfile: null,                        // saved while a Super Admin impersonates
    current(){ return this._profile; },
    isRole(r){ return this._profile && this._profile.role===r; },
    roleName(r){ return {superadmin:'Super Admin', owner:'Owner', manager:'Manager', staff:'Staff'}[r]||r; },
    isSuperAdmin(){ return this._profile && this._profile.role==='superadmin'; },

    _saveLocal(p){ try{ localStorage.setItem(LS, JSON.stringify(p)); }catch(e){} this._profile=p; return p; },
    _clearLocal(){ try{ localStorage.removeItem(LS); }catch(e){} },

    // Was this account auto-created by an old Google flow (not a real invite)?
    async _isAutoGoogle(u){
      if(!u) return false;
      if(u.via==='google') return true;
      try{ const k=u.kitchenId?await MKR.db.get('kitchens',u.kitchenId):null; if(k&&k.via==='google') return true; }catch(e){}
      return false;
    },

    // ---- Supabase profile (used by the cloud fallback + Google) ----
    //  Google / external sign-in NEVER creates an account. The email must already
    //  belong to an invited user (applied owner, joined manager, hired staff) or be
    //  the Super Admin — otherwise it's rejected with an "ask to be invited" notice.
    async _loadProfile(authUser){
      if(!authUser) return null;
      const email=(authUser.email||'').toLowerCase();
      // The designated Super Admin email is always the super admin (e.g. via Google).
      if(email===SUPER_EMAIL){
        return this._saveLocal({ id:'u_super', uid:authUser.id, name:'Super Admin', role:'superadmin', emoji:'🛡️', email:SUPER_EMAIL });
      }
      // External (Google) email → invite-only. Match an existing, non-pending user.
      if(email && !email.endsWith('@mkr.app')){
        let u=null; try{ u=(await MKR.db.getAll('users')).find(x=>(x.email||'').toLowerCase()===email && !x.offboarded && x.status!=='pending'); }catch(e){}
        if(u && !(await this._isAutoGoogle(u))){
          return this._saveLocal({ id:u.id, uid:authUser.id, name:u.name, role:u.role, emoji:u.emoji||EMO[u.role]||'', username:u.username, kitchenId:u.kitchenId||'k_main' });
        }
        // Not invited → refuse and sign back out.
        try{ sessionStorage.setItem('mkr.authmsg','no-invite'); }catch(e){}
        try{ await MKR.supa.client.auth.signOut(); }catch(e){}
        this._profile=null; this._clearLocal(); return null;
      }
      // Username (@mkr.app) cloud accounts → profiles row.
      const {data} = await MKR.supa.client.from('profiles').select('*').eq('id', authUser.id).limit(1);
      let p = data && data[0];
      if(!p || p.active===false){ await MKR.supa.client.auth.signOut(); this._profile=null; return null; }
      this._profile = { id: p.staff_id||p.id, uid: authUser.id, name: p.name, role: p.role, emoji: p.emoji||'', username: p.username, kitchenId: p.kitchen_id||'k_main' };
      return this._profile;
    },

    // ---- Restore on startup ----
    async restore(){
      try{ const raw=localStorage.getItem(LS); if(raw){ const p=JSON.parse(raw);
        if(p.role==='superadmin'){ this._profile=p; return p; }
        // Drop leftover sessions from the old Google auto-provision so they can't get stuck.
        try{ const u=await MKR.db.get('users', p.id); if(u && (u.offboarded || await this._isAutoGoogle(u))){ this._clearLocal(); } else { this._profile=p; return p; } }
        catch(e){ this._profile=p; return p; }
      } }catch(e){}
      if(!MKR.supa.client) return null;
      try{ const {data}=await MKR.supa.client.auth.getSession();
        if(data.session) return await this._loadProfile(data.session.user);
      }catch(e){}
      return null;
    },

    // ---- Local-first login ----
    async login(identifier, password){
      const id = String(identifier||'').trim();
      const idLower = id.toLowerCase();

      // 1) Super Admin
      if(idLower===SUPER_EMAIL){
        if(password!==SUPER_PW) return {ok:false, msg:'Wrong Super Admin password'};
        const p = this._saveLocal({ id:'u_super', uid:'local-super', name:'Super Admin', role:'superadmin', emoji:'🛡️', email:SUPER_EMAIL });
        MKR.audit.log({action:'login', desc:'Super Admin signed in'});
        return {ok:true, user:p};
      }

      // 2) Local account (registered owners/managers/staff + seeded demo users)
      try{
        const users = await MKR.db.getAll('users');
        const u = users.find(x=> x.pw && x.pw===password && ((x.username||'').toLowerCase()===idLower || (x.email||'').toLowerCase()===idLower));
        if(u){
          if(u.offboarded) return {ok:false, msg:'This account has been offboarded'};
          if(u.status==='pending') return {ok:false, msg:'Your application is still pending approval'};
          if(u.role!=='owner'){
            // managers/staff need an active kitchen
            const k = u.kitchenId ? await MKR.db.get('kitchens', u.kitchenId) : null;
            if(k && k.status && k.status!=='active') return {ok:false, msg:'This restaurant is not active yet'};
          } else {
            const k = u.kitchenId ? await MKR.db.get('kitchens', u.kitchenId) : null;
            if(k && k.status==='pending') return {ok:false, msg:'Your restaurant is still pending approval'};
            if(k && k.status==='rejected') return {ok:false, msg:'Your application was not approved'};
          }
          const p = this._saveLocal({ id:u.id, uid:'local', name:u.name, role:u.role, emoji:u.emoji||EMO[u.role]||'', username:u.username, kitchenId:u.kitchenId||'k_main' });
          MKR.audit.log({action:'login', desc:`${u.name} signed in (${this.roleName(u.role)})`});
          return {ok:true, user:p};
        }
      }catch(e){}

      // 3) Supabase Auth fallback (cloud accounts)
      if(MKR.supa.client){
        const email = MKR.supa.emailFor(id);
        const {data, error} = await MKR.supa.client.auth.signInWithPassword({email, password});
        if(!error){
          const prof = await this._loadProfile(data.user);
          if(prof){ MKR.audit.log({action:'login', desc:`${prof.name} signed in (${this.roleName(prof.role)})`}); return {ok:true, user:prof}; }
          return {ok:false, msg:'This account is disabled or has no role assigned'};
        }
      }
      return {ok:false, msg:'Wrong username/email or password'};
    },

    // ---- Super Admin impersonation (view a kitchen as owner/manager/staff) ----
    impersonate(role, kitchenId, name){
      if(!this._realProfile) this._realProfile = this._profile;
      this._profile = { id:this._realProfile.id, uid:this._realProfile.uid, name: name||('Preview · '+this.roleName(role)),
        role, emoji: EMO[role]||'🛡️', kitchenId: kitchenId||'k_main', _impersonating:true };
      return this._profile;
    },
    exitImpersonate(){ if(this._realProfile){ this._profile=this._realProfile; this._realProfile=null; this._saveLocal(this._profile); } },

    // ---- Owner switches the active branch (tenant) for this session ----
    switchKitchen(kitchenId){ if(!this._profile||!kitchenId) return; this._profile.kitchenId=kitchenId; this._saveLocal(this._profile); return this._profile; },

    // ---- Continue with Google (kept for the future real-auth path) ----
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
      this._clearLocal(); this._realProfile=null;
      try{ if(MKR.supa.client) await MKR.supa.client.auth.signOut(); }catch(e){}
      this._profile=null; location.hash='#/login'; location.reload();
    }
  };
  MKR.auth = Auth;
})();
