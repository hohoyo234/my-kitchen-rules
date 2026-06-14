/* ===== 登录 / 会话 / 角色（真实 Supabase Auth）=====
   每人独立账号(用户名→合成邮箱 + 密码)。角色与 staff_id 存 profiles 表。
   会话由 Supabase 维护(localStorage)。RLS 在数据库层按角色强制隔离。
*/
window.MKR = window.MKR || {};
(function(){
  const Auth = {
    _profile: null,
    current(){ return this._profile; },
    isRole(r){ return this._profile && this._profile.role===r; },
    roleName(r){ return {owner:'老板',manager:'经理',staff:'员工'}[r]||r; },

    // 读取当前登录用户的 profile（角色等）
    async _loadProfile(authUser){
      if(!authUser) return null;
      const {data} = await MKR.supa.client.from('profiles').select('*').eq('id', authUser.id).limit(1);
      const p = data && data[0];
      if(!p || p.active===false){ await MKR.supa.client.auth.signOut(); this._profile=null; return null; }
      this._profile = { id: p.staff_id||p.id, uid: authUser.id, name: p.name, role: p.role, emoji: p.emoji||'', username: p.username };
      return this._profile;
    },

    // 开机恢复会话
    async restore(){
      if(!MKR.supa.client) return null;
      try{ const {data}=await MKR.supa.client.auth.getSession();
        if(data.session) return await this._loadProfile(data.session.user);
      }catch(e){}
      return null;
    },

    async login(username, password){
      if(!MKR.supa.client) return {ok:false, msg:'未连接云端，无法登录'};
      const email = MKR.supa.emailFor(username);
      const {data, error} = await MKR.supa.client.auth.signInWithPassword({email, password});
      if(error) return {ok:false, msg:'账号或密码错误'};
      const prof = await this._loadProfile(data.user);
      if(!prof) return {ok:false, msg:'该账号已停用或未分配角色'};
      MKR.audit.log({action:'login', desc:`${prof.name} 登录（${this.roleName(prof.role)}）`});
      return {ok:true, user:prof};
    },

    async logout(){
      try{ if(MKR.supa.client) await MKR.supa.client.auth.signOut(); }catch(e){}
      this._profile=null; location.hash='#/login'; location.reload();
    }
  };
  MKR.auth = Auth;
})();
