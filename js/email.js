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
  MKR.email = { send };
})();
