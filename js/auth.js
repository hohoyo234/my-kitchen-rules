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

    // ---- Supabase profile (used by the cloud fallback + Google) ----
    async _loadProfile(authUser){
      if(!authUser) return null;
      // The designated Super Admin email is always the super admin (e.g. via Google).
      if((authUser.email||'').toLowerCase()===SUPER_EMAIL){
        return this._saveLocal({ id:'u_super', uid:authUser.id, name:'Super Admin', role:'superadmin', emoji:'🛡️', email:SUPER_EMAIL });
      }
      const {data} = await MKR.supa.client.from('profiles').select('*').eq('id', authUser.id).limit(1);
      let p = data && data[0];
      if(!p && authUser.email && !authUser.email.endsWith('@mkr.app')){
        p = await this._provisionOAuthOwner(authUser);
      }
      if(!p || p.active===false){ await MKR.supa.client.auth.signOut(); this._profile=null; return null; }
      this._profile = { id: p.staff_id||p.id, uid: authUser.id, name: p.name, role: p.role, emoji: p.emoji||'', username: p.username, kitchenId: p.kitchen_id||'k_main' };
      return this._profile;
    },

    // New Google user → owner of a brand-new (pending) kitchen.
    async _provisionOAuthOwner(authUser){
      const meta = authUser.user_metadata||{};
      const name = meta.full_name || meta.name || (authUser.email||'').split('@')[0] || 'Owner';
      const staffId = 'u_'+authUser.id.slice(0,8);
      const kitchenId = 'k_'+authUser.id.slice(0,8);
      const profile = { id:authUser.id, username:(authUser.email||'').split('@')[0], name, role:'owner', staff_id:staffId, emoji:'👑', active:true, kitchen_id:kitchenId };
      try{
        await MKR.supa.client.from('profiles').upsert(profile);
        await MKR.db.put('users', {id:staffId, role:'owner', name, username:profile.username, email:authUser.email, emoji:'👑', kitchenId, status:'active', onboarded:true, createdAt:Date.now()});
        await MKR.db.put('kitchens', {id:kitchenId, name:name+"'s Kitchen", location:'', status:'pending', ownerId:staffId, setupComplete:false, createdAt:Date.now(), via:'google'});
      }catch(e){ /* RLS may block writes; still allow local owner session */ }
      return profile;
    },

    // ---- Restore on startup ----
    async restore(){
      try{ const raw=localStorage.getItem(LS); if(raw){ this._profile=JSON.parse(raw); return this._profile; } }catch(e){}
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
