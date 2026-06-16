/* ===== Supabase cloud configuration =====
   The URL and anon key are "publicly usable" front-end keys. Secrets never live
   in the front end.
*/
window.MKR = window.MKR || {};
(function(){
  const URL  = 'https://gopluilwaltawempixeg.supabase.co';
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvcGx1aWx3YWx0YXdlbXBpeGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzODEwMzAsImV4cCI6MjA5Njk1NzAzMH0.hTH-YuxWjPKmJukq4hBo4NySMuxsRV7yWs86y6DhsqI';

  const TABLES = ['kitchens','users','menu','orders','shifts','tasks','swaps','sos','alerts','reconciliations','clockins','onboarding','audit','customer_feedback'];

  let client=null, signupClient=null;
  try{
    if(window.supabase && window.supabase.createClient){
      // Primary client: persists the session (login state)
      client = window.supabase.createClient(URL, ANON, {
        auth:{ persistSession:true, autoRefreshToken:true, storageKey:'mkr-auth', detectSessionInUrl:true, flowType:'pkce' },
        realtime:{ params:{ eventsPerSecond:10 } }
      });
      // Secondary client: only used when a manager creates a staff account via
      // signUp, so it never disturbs the manager's own session.
      signupClient = window.supabase.createClient(URL, ANON, {
        auth:{ persistSession:false, autoRefreshToken:false, storageKey:'mkr-signup' }
      });
    }
  }catch(e){ console.warn('[supa] init failed, falling back to local-only mode', e); }

  // Web Push public key (public, safe); the private key lives in the Supabase
  // Edge Function secrets.
  const VAPID_PUBLIC = 'BLSuk74ERv84DMOor2yQcbDcMsLhP0V2whVy4R_WBLTF5ckK9_GbRYmZW8Zhmy97BNn_3j6k1zxSswglGIldEh8';

  MKR.supa = {
    client, signupClient, URL, ANON, TABLES, VAPID_PUBLIC, enabled: !!client,
    // username -> synthetic email (staff only need to remember username + password)
    emailFor: (u)=> `${String(u||'').trim().toLowerCase()}@mkr.app`
  };
})();
