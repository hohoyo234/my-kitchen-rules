/* ===== Email sender (generic) =====
   Sends transactional email via the Supabase Edge Function `send-email`, which
   holds the Resend API key server-side (never in the front end). Returns
   {ok:true} or {ok:false, error}. Degrades gracefully when not deployed.
*/
window.MKR = window.MKR || {};
(function(){
  async function send({to, subject, html, text}){
    try{
      if(!MKR.supa || !MKR.supa.client || !MKR.supa.URL) return {ok:false, error:'cloud not connected'};
      if(!to || !subject) return {ok:false, error:'missing to/subject'};
      let token=''; try{ const {data}=await MKR.supa.client.auth.getSession(); token=(data&&data.session&&data.session.access_token)||''; }catch(e){}
      const res = await fetch(`${MKR.supa.URL}/functions/v1/send-email`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'apikey':MKR.supa.ANON, ...(token?{Authorization:'Bearer '+token}:{}) },
        body: JSON.stringify({ to, subject, html, text })
      });
      const out = await res.json().catch(()=>({}));
      if(!res.ok) return {ok:false, error:(out && (out.error||out.message)) || ('HTTP '+res.status)};
      return {ok:true, id: out && out.id};
    }catch(e){ return {ok:false, error:String(e && e.message || e)}; }
  }
  // Branded HTML email template (inline styles for email-client compatibility).
  // opts: { brand, title, intro, code, ctaUrl, ctaLabel, footer }
  function template(o){
    o = o || {};
    const esc = (s)=> (MKR.util ? MKR.util.esc(s) : String(s==null?'':s));
    const brand = esc(o.brand || 'My Kitchen');
    return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#F6F2EC;padding:28px 12px">
      <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ece6dd">
        <div style="background:#211E1B;color:#fff;padding:18px 24px;font-weight:800;font-size:18px;font-family:Georgia,'Times New Roman',serif">${brand}</div>
        <div style="padding:24px">
          <h1 style="font-size:20px;margin:0 0 8px;color:#211E1B">${esc(o.title||'')}</h1>
          <p style="color:#555;font-size:14px;line-height:1.6;margin:0 0 18px">${esc(o.intro||'')}</p>
          ${o.code?`<div style="text-align:center;margin:20px 0">
            <div style="display:inline-block;background:#F4E2D5;color:#9A4516;font-size:30px;font-weight:800;letter-spacing:8px;padding:14px 26px;border-radius:12px">${esc(o.code)}</div>
            <div style="color:#999;font-size:12px;margin-top:8px">验证码 30 分钟内有效 · This code expires in 30 min</div></div>`:''}
          ${o.ctaUrl?`<div style="text-align:center;margin:18px 0"><a href="${o.ctaUrl}" style="display:inline-block;background:#C9612E;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:14px">${esc(o.ctaLabel||'打开 / Open')}</a></div>`:''}
        </div>
        <div style="padding:14px 24px;border-top:1px solid #efe9e0;color:#aaa;font-size:12px">${esc(o.footer||'此邮件由 My Kitchen Rules 系统自动发送 · automated message')}</div>
      </div>
    </div>`;
  }

  MKR.email = { send, template };
})();
