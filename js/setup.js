/* ===== One-off account bootstrap (first run / debug only) =====
   Run MKR.setup.createDemoAccounts() in the browser console to:
   - create the 5 demo accounts via the secondary client signUp (without
     disturbing the current session)
   - write profiles (role / name / staff_id)
   Must be run with RLS disabled or with write access to profiles.
*/
window.MKR = window.MKR || {};
(function(){
  const ACCOUNTS = [
    {username:'boss',  password:'boss1111',  role:'owner',   staff_id:'u_boss',  name:'James Carter', emoji:'👑'},
    {username:'mgr',   password:'mgr2222',   role:'manager', staff_id:'u_mgr',   name:'Maria Lopez',  emoji:'📋'},
    {username:'amy',   password:'amy3333',   role:'staff',   staff_id:'u_amy',   name:'Amy',   emoji:'🧑‍🍳'},
    {username:'kevin', password:'kevin3333', role:'staff',   staff_id:'u_kevin', name:'Kevin', emoji:'🧑‍🍳'},
    {username:'leo',   password:'leo3333',   role:'staff',   staff_id:'u_leo',   name:'Leo',   emoji:'🧑‍🍳'},
  ];

  async function createDemoAccounts(){
    const out=[];
    for(const a of ACCOUNTS){
      const email = MKR.supa.emailFor(a.username);
      let uid=null;
      // Try to register first
      const {data:su, error:se} = await MKR.supa.signupClient.auth.signUp({email, password:a.password});
      if(su && su.user){ uid = su.user.id; }
      else {
        // Already exists → sign in via the secondary client to get the uid
        const {data:si} = await MKR.supa.signupClient.auth.signInWithPassword({email, password:a.password});
        if(si && si.user) uid = si.user.id;
      }
      if(!uid){ out.push(`${a.username}: ❌ ${se?se.message:'could not get uid'}`); continue; }
      // Write profiles (primary client; RLS should be off or you have write access)
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
