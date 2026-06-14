/* ===== Supabase 云端配置 =====
   URL 和 anon key 都是「公开可用」的前端 key。机密永不放前端。
*/
window.MKR = window.MKR || {};
(function(){
  const URL  = 'https://gopluilwaltawempixeg.supabase.co';
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdvcGx1aWx3YWx0YXdlbXBpeGVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEzODEwMzAsImV4cCI6MjA5Njk1NzAzMH0.hTH-YuxWjPKmJukq4hBo4NySMuxsRV7yWs86y6DhsqI';

  const TABLES = ['users','menu','orders','shifts','tasks','swaps','sos','alerts','reconciliations','clockins','onboarding','audit'];

  let client=null, signupClient=null;
  try{
    if(window.supabase && window.supabase.createClient){
      // 主客户端：保存会话（登录态）
      client = window.supabase.createClient(URL, ANON, {
        auth:{ persistSession:true, autoRefreshToken:true, storageKey:'mkr-auth' },
        realtime:{ params:{ eventsPerSecond:10 } }
      });
      // 副客户端：仅用于「经理建员工账号」时调用 signUp，不影响当前登录态
      signupClient = window.supabase.createClient(URL, ANON, {
        auth:{ persistSession:false, autoRefreshToken:false, storageKey:'mkr-signup' }
      });
    }
  }catch(e){ console.warn('[supa] 初始化失败，转纯本地模式', e); }

  MKR.supa = {
    client, signupClient, URL, ANON, TABLES, enabled: !!client,
    // 用户名 → 合成邮箱（员工只需记用户名+密码）
    emailFor: (u)=> `${String(u||'').trim().toLowerCase()}@mkr.app`
  };
})();
