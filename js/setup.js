/* ===== 一次性账号初始化(仅初次/调试用)=====
   在浏览器控制台运行 MKR.setup.createDemoAccounts() 即可:
   - 用副客户端 signUp 创建 5 个演示账号(不影响当前登录态)
   - 写入 profiles(角色/姓名/staff_id)
   需在「关闭 RLS」状态或拥有写 profiles 权限时执行。
*/
window.MKR = window.MKR || {};
(function(){
  const ACCOUNTS = [
    {username:'boss',  password:'boss1111',  role:'owner',   staff_id:'u_boss',  name:'王老板', emoji:'👑'},
    {username:'mgr',   password:'mgr2222',   role:'manager', staff_id:'u_mgr',   name:'李经理', emoji:'📋'},
    {username:'amy',   password:'amy3333',   role:'staff',   staff_id:'u_amy',   name:'Amy',   emoji:'🧑‍🍳'},
    {username:'kevin', password:'kevin3333', role:'staff',   staff_id:'u_kevin', name:'Kevin', emoji:'🧑‍🍳'},
    {username:'leo',   password:'leo3333',   role:'staff',   staff_id:'u_leo',   name:'Leo',   emoji:'🧑‍🍳'},
  ];

  async function createDemoAccounts(){
    const out=[];
    for(const a of ACCOUNTS){
      const email = MKR.supa.emailFor(a.username);
      let uid=null;
      // 先尝试注册
      const {data:su, error:se} = await MKR.supa.signupClient.auth.signUp({email, password:a.password});
      if(su && su.user){ uid = su.user.id; }
      else {
        // 已存在 → 用副客户端登录拿 uid
        const {data:si} = await MKR.supa.signupClient.auth.signInWithPassword({email, password:a.password});
        if(si && si.user) uid = si.user.id;
      }
      if(!uid){ out.push(`${a.username}: ❌ ${se?se.message:'无法获取 uid'}`); continue; }
      // 写 profiles（主客户端；此时应处于 RLS 关闭或有权限状态）
      const {error:pe} = await MKR.supa.client.from('profiles').upsert({
        id:uid, username:a.username, name:a.name, role:a.role, staff_id:a.staff_id, emoji:a.emoji, active:true
      });
      out.push(`${a.username}: ${pe?('❌ profile '+pe.message):'✅'}`);
    }
    await MKR.supa.signupClient.auth.signOut().catch(()=>{});
    return out.join('\n');
  }

  MKR.setup = { createDemoAccounts, ACCOUNTS };
})();
