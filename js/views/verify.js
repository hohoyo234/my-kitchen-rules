/* ===== Public email-verification page (no login) =====
   The recipient of a verification email lands here (#/verify/<email>), enters
   the 6-digit code from the email, and we confirm it via the SECURITY DEFINER
   function confirm_email_code (anon can call it; it never exposes other codes).
*/
window.MKR = window.MKR || {};
(function(){
  const U = ()=>MKR.util;
  function note(cls,msg){ return `<div class="alert ${cls}"><span>ℹ️</span><div>${MKR.util.esc(msg)}</div></div>`; }

  async function render(root, emailArg){
    const email = decodeURIComponent(String(emailArg||'').split('?')[0]||'').trim();
    root.innerHTML = `
      <div class="cust-wrap">
        <header class="cust-head"><div><div class="cust-brand">My Kitchen</div><div class="cust-table">✉️ 邮箱验证 · Verify email</div></div></header>
        <div class="card pad20" style="max-width:420px;margin:18px auto">
          <p class="muted" style="font-size:13.5px;margin-bottom:12px">输入邮件里的 6 位验证码完成验证。<br><span class="faint">Enter the 6-digit code from your email.</span></p>
          <div class="field"><label>邮箱 Email</label><input class="input" id="vEmail" value="${U().esc(email)}" placeholder="you@email.com" autocomplete="off"></div>
          <div class="field"><label>验证码 Code</label><input class="input" id="vCode" inputmode="numeric" maxlength="6" placeholder="6 位数字" autocomplete="off" style="letter-spacing:6px;font-size:20px;text-align:center"></div>
          <button class="btn btn-dark btn-block" id="vGo">验证 / Verify</button>
          <div id="vRes" class="mt16"></div>
        </div>
      </div>`;

    async function go(){
      const em=U().qs('#vEmail',root).value.trim(), code=U().qs('#vCode',root).value.trim();
      const res=U().qs('#vRes',root);
      if(!em || code.length<4){ res.innerHTML=note('amber','请填写邮箱和验证码。'); return; }
      res.innerHTML='<p class="muted">验证中…</p>';
      if(!(MKR.supa && MKR.supa.client)){ res.innerHTML=note('amber','离线不可用'); return; }
      let data=null, error=null;
      try{ const r=await MKR.supa.client.rpc('confirm_email_code',{ p_email:em, p_code:code }); data=r.data; error=r.error; }catch(e){ error=e; }
      if(error){ res.innerHTML=note('amber','此功能尚未启用，请稍后再试。'); return; }
      if(data && data.ok){ res.innerHTML=`<div class="alert green"><span>✅</span><div><b>邮箱已验证！</b><br>Your email is verified. 你可以关闭此页面了。</div></div>`; }
      else { res.innerHTML=note('red','验证码不正确或已过期。Code is wrong or expired.'); }
    }
    U().qs('#vGo',root).onclick=go;
    U().qs('#vCode',root).addEventListener('keydown',e=>{ if(e.key==='Enter') go(); });
    setTimeout(()=>{ const i=U().qs('#vCode',root); if(i) i.focus(); },60);
  }

  MKR.verify = { render };
})();
