/* ===== Login / session / roles (real Supabase Auth) =====
   Every person has their own account (username -> synthetic email + password,
   or Google OAuth). Role and staff_id live in the profiles table.
   The session is maintained by Supabase (localStorage). RLS enforces role
   isolation at the database layer.
*/
window.MKR = window.MKR || {};
(function(){
  const Auth = {
    _profile: null,
    current(){ return this._profile; },
    isRole(r){ return this._profile && this._profile.role===r; },
    roleName(r){ return {owner:'Owner',manager:'Manager',staff:'Staff'}[r]||r; },

    // Load the current user's profile (role etc.)
    async _loadProfile(authUser){
      if(!authUser) return null;
      const {data} = await MKR.supa.client.from('profiles').select('*').eq('id', authUser.id).limit(1);
      let p = data && data[0];
      // First-time Google / OAuth user with no profile yet → provision one.
      if(!p && authUser.email && !authUser.email.endsWith('@mkr.app')){
        p = await this._provisionOAuthOwner(authUser);
      }
      if(!p || p.active===false){ await MKR.supa.client.auth.signOut(); this._profile=null; return null; }
      this._profile = { id: p.staff_id||p.id, uid: authUser.id, name: p.name, role: p.role, emoji: p.emoji||'', username: p.username, kitchenId: p.kitchen_id||'k_main' };
      return this._profile;
    },

    // New Google user → become the owner of a brand-new kitchen (tenant onboarding)
    async _provisionOAuthOwner(authUser){
      const meta = authUser.user_metadata||{};
      const name = meta.full_name || meta.name || (authUser.email||'').split('@')[0] || 'Owner';
      const staffId = 'u_'+authUser.id.slice(0,8);
      const kitchenId = 'k_'+authUser.id.slice(0,8);
      const profile = { id:authUser.id, username:(authUser.email||'').split('@')[0], name, role:'owner', staff_id:staffId, emoji:'👑', active:true, kitchen_id:kitchenId };
      try{
        await MKR.supa.client.from('profiles').upsert(profile);
        await MKR.db.put('users', {id:staffId, role:'owner', name, username:profile.username, email:authUser.email, emoji:'👑', kitchenId, onboarded:true, createdAt:Date.now()});
        await MKR.db.put('kitchens', {id:kitchenId, name:name+"'s Kitchen", location:'', status:'pending', ownerId:staffId, createdAt:Date.now(), via:'google'});
      }catch(e){ /* RLS may block writes; still allow local owner session */ }
      return profile;
    },

    // Restore the session on startup (also handles the OAuth redirect callback)
    async restore(){
      if(!MKR.supa.client) return null;
      try{ const {data}=await MKR.supa.client.auth.getSession();
        if(data.session) return await this._loadProfile(data.session.user);
      }catch(e){}
      return null;
    },

    async login(username, password){
      if(!MKR.supa.client) return {ok:false, msg:'Cloud not connected — cannot sign in'};
      const email = MKR.supa.emailFor(username);
      const {data, error} = await MKR.supa.client.auth.signInWithPassword({email, password});
      if(error) return {ok:false, msg:'Wrong username or password'};
      const prof = await this._loadProfile(data.user);
      if(!prof) return {ok:false, msg:'This account is disabled or has no role assigned'};
      MKR.audit.log({action:'login', desc:`${prof.name} signed in (${this.roleName(prof.role)})`});
      return {ok:true, user:prof};
    },

    // Continue with Google (Supabase OAuth). Requires the Google provider to be
    // enabled in the Supabase dashboard. Redirects back to this app.
    async loginWithGoogle(){
      if(!MKR.supa.client) return {ok:false, msg:'Cloud not connected'};
      try{
        const redirectTo = location.origin + location.pathname;
        const {error} = await MKR.supa.client.auth.signInWithOAuth({ provider:'google', options:{ redirectTo } });
        if(error) return {ok:false, msg: error.message };
        return {ok:true, redirecting:true};   // browser navigates to Google
      }catch(e){ return {ok:false, msg: e.message || 'Google sign-in unavailable'}; }
    },

    async logout(){
      try{ if(MKR.supa.client) await MKR.supa.client.auth.signOut(); }catch(e){}
      this._profile=null; location.hash='#/login'; location.reload();
    }
  };
  MKR.auth = Auth;
})();
