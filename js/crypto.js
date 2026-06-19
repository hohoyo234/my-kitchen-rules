/* ===== Sensitive-field encryption (TFN / passport) =====
   ISSUE #4 FIX — the encryption key must NOT live next to the data.

   The REAL lock is now Row Level Security: the `onboarding` table (which holds
   tfnEnc / passportEnc) can only be read by the staff member themselves or the
   OWNER of their kitchen (see supabase/security-setup.sql). A manager, another
   staff member, or anyone holding the public anon key gets nothing.

   On top of that, this module encrypts the value at rest. The key is kept in
   DEVICE-LOCAL storage ONLY (localStorage 'mkr.fieldkey') and is NEVER written
   to the synced cloud `app_meta` table — so the key and the ciphertext no longer
   sit in the same place.

   ⚠️ Trade-off of the local key: a value encrypted on one device can only be
   decrypted on that same device. For cross-device reveal with true
   encryption-at-rest, decrypt server-side via the Edge Function
   supabase/functions/reveal-field (key in Supabase Vault, owner verified by JWT)
   — see SECURITY.md. With that in place the browser never holds the key at all.
*/
window.MKR = window.MKR || {};
(function(){
  const subtle = (window.crypto && window.crypto.subtle) ? window.crypto.subtle : null;
  const LOCAL_KEY = 'mkr.fieldkey';        // device-local, NEVER synced to the cloud
  const LOCAL_KEY_FB = 'mkr.fieldkey.fb';

  // --- device-local key storage (deliberately not MKR.db.meta, which syncs) ---
  function localGet(k){ try{ return localStorage.getItem(k)||null; }catch(e){ return null; } }
  function localSet(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

  async function getKey(){
    if(!subtle) return null;
    let b64 = localGet(LOCAL_KEY);
    if(b64){ const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)); return subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']); }
    const key=await subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
    const exported=new Uint8Array(await subtle.exportKey('raw',key));
    localSet(LOCAL_KEY, btoa(String.fromCharCode(...exported)));
    return key;
  }
  async function fallbackKey(){ let k=localGet(LOCAL_KEY_FB); if(!k){ k=MKR.util.uid('k')+MKR.util.uid('k'); localSet(LOCAL_KEY_FB,k);} return k; }
  function xorCipher(text,key){ let o=''; for(let i=0;i<text.length;i++) o+=String.fromCharCode(text.charCodeAt(i)^key.charCodeAt(i%key.length)); return o; }

  // --- Server-side crypto via the reveal-field Edge Function (key in Vault) ---
  // The function verifies the caller from their JWT (super admin / the staff
  // member themselves / the owner of that staff's kitchen). Returns null if the
  // function isn't deployed or the caller isn't signed in → we fall back to local.
  async function callServer(action, value, userId){
    if(!(MKR.supa && MKR.supa.client && MKR.supa.URL && MKR.supa.ANON)) return null;
    let token=''; try{ const {data}=await MKR.supa.client.auth.getSession(); token=(data&&data.session&&data.session.access_token)||''; }catch(e){}
    if(!token) return null;
    try{
      const res=await fetch(`${MKR.supa.URL}/functions/v1/reveal-field`,{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':MKR.supa.ANON,'Authorization':'Bearer '+token},
        body:JSON.stringify({action, value, userId:userId||null})
      });
      if(!res.ok) return null;
      const out=await res.json().catch(()=>null);
      return out && typeof out.value==='string' ? out.value : null;
    }catch(e){ return null; }
  }

  const C={
    available: !!subtle,
    // enc(plain, userId): prefer server-side encryption (Vault key, owner-readable
    // on ANY device); fall back to device-local AES when the function isn't there.
    async enc(plain, userId){
      if(plain==null||plain==='') return '';
      const srv = await callServer('encrypt', String(plain), userId);
      if(srv) return 'srv:'+srv;
      if(subtle){
        const key=await getKey();
        const iv=window.crypto.getRandomValues(new Uint8Array(12));
        const data=new TextEncoder().encode(String(plain));
        const ct=new Uint8Array(await subtle.encrypt({name:'AES-GCM',iv},key,data));
        const buf=new Uint8Array(iv.length+ct.length); buf.set(iv); buf.set(ct,iv.length);
        return 'aes:'+btoa(String.fromCharCode(...buf));
      }
      return 'xor:'+btoa(unescape(encodeURIComponent(xorCipher(String(plain), await fallbackKey()))));
    },
    async dec(blob, userId){
      if(!blob) return '';
      try{
        if(blob.startsWith('srv:')){
          const v = await callServer('decrypt', blob.slice(4), userId);
          return v!=null ? v : '⚠️ reveal unavailable — deploy the reveal-field function (see SECURITY.md)';
        }
        if(blob.startsWith('aes:') && subtle){
          const key=await getKey();
          const buf=Uint8Array.from(atob(blob.slice(4)),c=>c.charCodeAt(0));
          const iv=buf.slice(0,12), ct=buf.slice(12);
          return new TextDecoder().decode(await subtle.decrypt({name:'AES-GCM',iv},key,ct));
        }
        if(blob.startsWith('xor:')){ const raw=decodeURIComponent(escape(atob(blob.slice(4)))); return xorCipher(raw, await fallbackKey()); }
      }catch(e){ return '⚠️ decrypt failed (this value was encrypted on another device — see SECURITY.md)'; }
      return blob;
    },
    mask(){ return '••• ••• •••'; }
  };
  MKR.crypto=C;
})();
