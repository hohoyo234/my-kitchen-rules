/* ===== Sensitive-field encryption (TFN etc.) =====
   Meets the Privacy Act TFN Rule: a TFN is stored encrypted on its own and can
   only be revealed by the owner role.
   Prefers native WebCrypto AES-GCM; falls back to a reversible cipher if absent.
   The key lives in shared meta (synced to the cloud) so a TFN encrypted on
   device A can be decrypted by the owner on device B.
   Production should use server-side KMS / column-level encryption — this is MVP.
*/
window.MKR = window.MKR || {};
(function(){
  const subtle = (window.crypto && window.crypto.subtle) ? window.crypto.subtle : null;

  async function getKey(){
    if(!subtle) return null;
    let b64 = await MKR.db.meta('_fieldkey');
    if(b64){ const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)); return subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']); }
    const key=await subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']);
    const exported=new Uint8Array(await subtle.exportKey('raw',key));
    await MKR.db.meta('_fieldkey', btoa(String.fromCharCode(...exported)));
    return key;
  }
  async function fallbackKey(){ let k=await MKR.db.meta('_fieldkey_fb'); if(!k){ k=MKR.util.uid('k')+MKR.util.uid('k'); await MKR.db.meta('_fieldkey_fb',k);} return k; }
  function xorCipher(text,key){ let o=''; for(let i=0;i<text.length;i++) o+=String.fromCharCode(text.charCodeAt(i)^key.charCodeAt(i%key.length)); return o; }

  const C={
    available: !!subtle,
    async enc(plain){
      if(plain==null||plain==='') return '';
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
    async dec(blob){
      if(!blob) return '';
      try{
        if(blob.startsWith('aes:') && subtle){
          const key=await getKey();
          const buf=Uint8Array.from(atob(blob.slice(4)),c=>c.charCodeAt(0));
          const iv=buf.slice(0,12), ct=buf.slice(12);
          return new TextDecoder().decode(await subtle.decrypt({name:'AES-GCM',iv},key,ct));
        }
        if(blob.startsWith('xor:')){ const raw=decodeURIComponent(escape(atob(blob.slice(4)))); return xorCipher(raw, await fallbackKey()); }
      }catch(e){ return '⚠️ decrypt failed'; }
      return blob;
    },
    mask(){ return '••• ••• •••'; }
  };
  MKR.crypto=C;
})();
