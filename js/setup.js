/* ===== One-off DEMO account bootstrap (first run only) =====
   ⚠️ DEMO ONLY. The passwords below are throwaway demo credentials, not real
   secrets — do NOT use this for a real restaurant's owner/staff. For production,
   create accounts in the Supabase dashboard (Authentication → Users) with strong
   passwords, then add the matching profiles rows.

   Run MKR.setup.createDemoAccounts() in the browser console to:
   - create the 5 demo accounts in Supabase Auth (signUp), and
   - PRINT a ready-to-paste SQL snippet that inserts their profiles rows.
   Profiles are role-protected by RLS now, so the snippet must be run in the
   Supabase SQL Editor (which uses the service role and bypasses RLS). See
   SECURITY.md.
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
    const rows=[], out=[];
    for(const a of ACCOUNTS){
      const email = MKR.supa.emailFor(a.username);
      let uid=null;
      const {data:su, error:se} = await MKR.supa.signupClient.auth.signUp({email, password:a.password});
      if(su && su.user){ uid = su.user.id; }
      else {
        const {data:si} = await MKR.supa.signupClient.auth.signInWithPassword({email, password:a.password});
        if(si && si.user) uid = si.user.id;
      }
      if(!uid){ out.push(`${a.username}: ❌ ${se?se.message:'could not get uid'}`); continue; }
      out.push(`${a.username}: ✅ auth user ${uid}`);
      rows.push(`  ('${uid}','${a.username}','${a.name.replace(/'/g,"''")}','${a.role}','${a.staff_id}','k_main','${a.emoji}',true)`);
    }
    await MKR.supa.signupClient.auth.signOut().catch(()=>{});
    const sql = rows.length ? (
      `\n-- Paste this into the Supabase SQL Editor to grant the demo roles:\n`+
      `insert into public.profiles (id,username,name,role,staff_id,kitchen_id,emoji,active) values\n`+
      rows.join(',\n')+`\n`+
      `on conflict (id) do update set role=excluded.role, kitchen_id=excluded.kitchen_id, active=true;\n`
    ) : '';
    const report = out.join('\n')+sql;
    console.log(report);
    return report;
  }

  MKR.setup = { createDemoAccounts, ACCOUNTS };
})();
