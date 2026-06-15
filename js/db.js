/* ===== 数据层 (Data Layer) — 本地优先 + 云端实时镜像 =====
   读：永远先读本地 IndexedDB（瞬时、断网可用）。
   写：先写本地（界面立刻更新、断网照常），再后台推送到 Supabase；
       断网时进 outbox 队列，联网后自动冲洗。
   多设备：订阅 Supabase Realtime，别的设备改了数据会实时合并进本地。
   冲突：last-write-wins（按 updatedAt 比较，谁新留谁）。
   没有 Supabase（CDN 没加载/纯离线）时，自动退化为纯本地模式，功能不受影响。
*/
window.MKR = window.MKR || {};
(function(){
  const DBNAME='mkr-cloud', VER=1;
  const NS='mkr.';                      // 草稿等仍用 localStorage
  const emitter={};
  let _db=null,_ready=null;
  const sb = ()=> (MKR.supa && MKR.supa.client) || null;
  const TABLES = ()=> (MKR.supa && MKR.supa.TABLES) || [];

  // ---------- IndexedDB ----------
  function open(){ return new Promise((res,rej)=>{
    const r=indexedDB.open(DBNAME,VER);
    r.onupgradeneeded=()=>{ const d=r.result;
      if(!d.objectStoreNames.contains('rows')) d.createObjectStore('rows');     // key: table::id  val: object
      if(!d.objectStoreNames.contains('meta')) d.createObjectStore('meta');     // key: metaKey   val: value
      if(!d.objectStoreNames.contains('outbox')) d.createObjectStore('outbox',{autoIncrement:true});
    };
    r.onsuccess=()=>{ _db=r.result; res(_db); }; r.onerror=()=>rej(r.error);
  }); }
  function ready(){ if(!_ready) _ready=open(); return _ready; }
  function tx(store,mode){ return _db.transaction(store,mode).objectStore(store); }
  function P(req){ return new Promise((res,rej)=>{ req.onsuccess=()=>res(req.result); req.onerror=()=>rej(req.error); }); }

  const K=(t,id)=>t+'::'+id;
  async function lget(t,id){ await ready(); return P(tx('rows','readonly').get(K(t,id))); }
  async function lall(t){ await ready(); const r=IDBKeyRange.bound(t+'::', t+'::￿'); return P(tx('rows','readonly').getAll(r)); }
  async function lput(t,obj){ await ready(); return P(tx('rows','readwrite').put(obj, K(t,obj.id))); }
  async function ldel(t,id){ await ready(); return P(tx('rows','readwrite').delete(K(t,id))); }
  async function lmetaGet(k){ await ready(); return P(tx('meta','readonly').get(k)); }
  async function lmetaSet(k,v){ await ready(); return P(tx('meta','readwrite').put(v,k)); }

  // ---------- outbox（离线队列）----------
  let _pending=0;
  async function outAdd(op){ await ready(); await P(tx('outbox','readwrite').add(op)); _pending++; if(MKR.net)MKR.net.render(); }
  async function outAll(){ await ready(); const s=tx('outbox','readonly'); const keys=await P(s.getAllKeys()); const vals=await P(s.getAll()); return keys.map((k,i)=>({key:k,op:vals[i]})); }
  async function outDel(key){ await ready(); await P(tx('outbox','readwrite').delete(key)); _pending=Math.max(0,_pending-1); if(MKR.net)MKR.net.render(); }
  async function outCount(){ await ready(); return P(tx('outbox','readonly').count()); }

  function emit(t){ (emitter[t]||[]).forEach(fn=>{ try{fn();}catch(e){} }); }

  // ---------- 云端推送 ----------
  async function pushUpsert(t,obj){
    if(sb() && navigator.onLine){
      const {error}=await sb().from(t).upsert({id:obj.id,data:obj,updated_at:new Date().toISOString()});
      if(error){ await outAdd({type:'upsert',t,obj}); }
    } else if(sb()){ await outAdd({type:'upsert',t,obj}); }
  }
  async function pushDelete(t,id){
    if(sb() && navigator.onLine){
      const {error}=await sb().from(t).delete().eq('id',id);
      if(error){ await outAdd({type:'delete',t,id}); }
    } else if(sb()){ await outAdd({type:'delete',t,id}); }
  }
  async function pushMeta(k,v){
    if(sb() && navigator.onLine){
      const {error}=await sb().from('app_meta').upsert({key:k,value:v});
      if(error){ await outAdd({type:'meta',k,v}); }
    } else if(sb()){ await outAdd({type:'meta',k,v}); }
  }

  // ---------- 冲洗 outbox ----------
  let flushing=false, _subscribed=false;
  async function flush(){
    if(flushing || !sb() || !navigator.onLine) return;
    flushing=true;
    try{
      const items=await outAll();
      for(const {key,op} of items){
        let err=null;
        if(op.type==='upsert'){ const r=await sb().from(op.t).upsert({id:op.obj.id,data:op.obj,updated_at:new Date().toISOString()}); err=r.error; }
        else if(op.type==='delete'){ const r=await sb().from(op.t).delete().eq('id',op.id); err=r.error; }
        else if(op.type==='meta'){ const r=await sb().from('app_meta').upsert({key:op.k,value:op.v}); err=r.error; }
        if(!err) await outDel(key); else break;   // 失败就停，等下次
      }
    }finally{ flushing=false; }
    if(MKR.net && MKR.net.render) MKR.net.render();
  }

  // ---------- 拉取 + 合并 ----------
  async function mergeRow(t,id,remoteObj){
    const local=await lget(t,id);
    if(!local || (remoteObj.updatedAt||0)>=(local.updatedAt||0)) await lput(t,remoteObj);
  }
  async function pull(t){
    if(!sb()) return;
    const {data,error}=await sb().from(t).select('id,data');
    if(error || !data) return;
    for(const r of data){ if(r.data) await mergeRow(t,r.id,r.data); }
    emit(t);
  }
  async function pullMeta(){
    if(!sb()) return;
    const {data,error}=await sb().from('app_meta').select('key,value');
    if(error || !data) return;
    for(const r of data){ const cur=await lmetaGet(r.key); if(cur===undefined) await lmetaSet(r.key,r.value); }
  }

  // ---------- 实时订阅 ----------
  function subscribe(){
    if(!sb()) return;
    const handle=async(p)=>{
      const t=p.table;
      try{
        if(t==='app_meta'){ if(p.eventType!=='DELETE' && p.new) await lmetaSet(p.new.key,p.new.value); return; }
        if(p.eventType==='DELETE'){ if(p.old&&p.old.id) await ldel(t,p.old.id); }
        else if(p.new && p.new.data){ await mergeRow(t,p.new.id,p.new.data); }
        emit(t);
      }catch(e){}
    };
    let ch=sb().channel('mkr-all');
    TABLES().forEach(t=>{ ch=ch.on('postgres_changes',{event:'*',schema:'public',table:t},handle); });
    ch=ch.on('postgres_changes',{event:'*',schema:'public',table:'app_meta'},handle);
    ch.subscribe();
  }

  // ---------- 公共 API（与原来完全一致，界面无需改动）----------
  const DB={
    cloud: ()=> !!sb(),
    pendingCount: outCount,

    async getAll(t){ return lall(t); },
    async get(t,id){ return (await lget(t,id))||null; },
    async query(t,pred){ return (await lall(t)).filter(pred||(()=>true)); },

    async put(t,obj){
      if(!obj.id){ obj.id=MKR.util.uid(t.slice(0,3)); obj.createdAt=obj.createdAt||Date.now(); }
      // 合并:传入部分字段时，保留原记录其它字段(避免部分更新覆盖整行)
      const existing = await lget(t, obj.id);
      const merged = {...(existing||{}), ...obj, updatedAt:Date.now()};
      await lput(t,merged); emit(t);
      pushUpsert(t,merged);
      return merged;
    },
    async remove(t,id){ await ldel(t,id); emit(t); pushDelete(t,id); return true; },
    async append(t,obj){
      obj.id=obj.id||MKR.util.uid('log'); obj.ts=obj.ts||Date.now(); obj.frozen=true; obj.updatedAt=Date.now();
      await lput(t,obj); emit(t); pushUpsert(t,obj); return obj;
    },
    async meta(k,v){
      if(v===undefined){ const x=await lmetaGet(k); return x===undefined?undefined:x; }
      await lmetaSet(k,v); pushMeta(k,v); return v;
    },

    on(t,fn){ (emitter[t]=emitter[t]||[]).push(fn); return ()=>{ emitter[t]=emitter[t].filter(f=>f!==fn); }; },

    draft:{
      save(k,d){ localStorage.setItem(NS+'draft.'+k, JSON.stringify({data:d,ts:Date.now()})); },
      load(k){ try{ return JSON.parse(localStorage.getItem(NS+'draft.'+k)||'null'); }catch(e){ return null; } },
      clear(k){ localStorage.removeItem(NS+'draft.'+k); }
    },

    // 启动/登录后同步：拉云端 → 订阅实时(仅一次) → 冲洗离线队列
    async initSync(){
      await ready();
      _pending = await outCount();
      if(sb()){
        try{
          await Promise.all(TABLES().map(pull));
          await pullMeta();
          if(!_subscribed){ subscribe(); _subscribed=true; }
          flush();
        }catch(e){ console.warn('[db] 云端同步失败，转本地模式',e); }
      }
      DB._pending=_pending;
      if(MKR.net&&MKR.net.render) MKR.net.render();
    },
    flush,

    // 重置（清本地 + 清云端）
    async wipe(){
      if(sb()){ for(const t of TABLES()){ try{ await sb().from(t).delete().neq('id','__none__'); }catch(e){} } try{ await sb().from('app_meta').delete().neq('key','__none__'); }catch(e){} }
      if(_db){ _db.close(); _db=null; _ready=null; }
      await new Promise(r=>{ const req=indexedDB.deleteDatabase(DBNAME); req.onsuccess=req.onerror=req.onblocked=()=>r(); });
      Object.keys(localStorage).filter(k=>k.startsWith(NS)).forEach(k=>localStorage.removeItem(k));
    },

    raw:{ engine: ()=> (sb()?'IndexedDB + Supabase(云端实时)':'IndexedDB(纯本地)') }
  };
  // 让 _pending 始终反映模块内计数
  Object.defineProperty(DB,'_pending',{ get:()=>_pending, set:(v)=>{_pending=v;}, configurable:true });

  MKR.db=DB;
})();
