/* ===== Account security: change password / forgot password =====
   Uses Supabase Auth — the password is hashed server-side; we never store it.
   - openChangePassword(): for a signed-in user (updateUser).
   - forgotPassword(email): emails a reset link (only reaches real email inboxes;
     username@mkr.app synthetic accounts have no inbox — an owner/manager resets
     those by re-issuing the account).
*/
window.MKR = window.MKR || {};
(function(){
  const U = MKR.util;

  function openChangePassword(){
    if(!(MKR.supa && MKR.supa.client)){ U.toast('Secure sign-in not connected','red'); return; }
    const body = `
      <p class="muted" style="font-size:13px;margin-bottom:12px">Choose a new password for your account (at least 6 characters).</p>
      <div class="field"><label>New password</label><input class="input" id="np1" type="password" autocomplete="new-password" placeholder="new password"></div>
      <div class="field"><label>Confirm new password</label><input class="input" id="np2" type="password" autocomplete="new-password" placeholder="repeat it"></div>
      <div id="pwerr" class="alert red hidden" style="margin-bottom:2px"></div>`;
    U.modal('🔑 Change password', body, { actions:[
      { label:'Cancel', class:'btn-ghost', onClick:(close)=>close() },
      { label:'Update password', class:'btn-dark', onClick:async(close)=>{
          const err=U.qs('#pwerr'); const show=(m)=>{ err.textContent='⚠️ '+m; err.classList.remove('hidden'); };
          const p1=(U.qs('#np1').value||''), p2=(U.qs('#np2').value||'');
          if(p1.length<6) return show('Password must be at least 6 characters');
          if(p1!==p2)     return show("The two passwords don't match");
          const {error}=await MKR.supa.client.auth.updateUser({password:p1});
          if(error) return show(error.message);
          try{ MKR.audit.log({action:'settings.update', desc:'Changed own password'}); }catch(e){}
          close(); U.toast('Password updated ✓','green');
      }}
    ]});
  }

  async function forgotPassword(email){
    if(!(MKR.supa && MKR.supa.client)) return {ok:false, msg:'Cloud not connected'};
    try{
      const redirectTo = location.origin + location.pathname;
      const {error}=await MKR.supa.client.auth.resetPasswordForEmail(String(email||'').trim(), {redirectTo});
      if(error) return {ok:false, msg:error.message};
      return {ok:true};
    }catch(e){ return {ok:false, msg:e.message||'Could not send reset email'}; }
  }

  MKR.account = { openChangePassword, forgotPassword };
})();
