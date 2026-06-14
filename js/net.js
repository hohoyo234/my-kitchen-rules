/* ===== 底层保障：断网保护 / 状态红绿灯 / 误刷新拦截 / 静默同步 ===== */
window.MKR = window.MKR || {};
(function(){
  let dirty=false;

  const Net = {
    online: navigator.onLine,
    setDirty(v){ dirty=!!v; },
    isDirty(){ return dirty; },
    pending(){ return (MKR.db && MKR.db._pending) || 0; },

    render(){
      const light=MKR.util.qs('#netlight'); if(!light) return;
      const cloud = MKR.db && MKR.db.cloud && MKR.db.cloud();
      const pend=Net.pending();
      if(!Net.online){
        light.className='netlight offline';
        light.innerHTML=`<span class="lamp"></span>本地保护模式${pend?` · 积压 ${pend}`:''}`;
      } else if(pend>0){
        light.className='netlight syncing';
        light.innerHTML=`<span class="lamp"></span>同步中 · ${pend}`;
      } else {
        light.className='netlight online';
        light.innerHTML=`<span class="lamp"></span>${cloud?'已连接云端':'已连接(本地)'}`;
      }
      const bar=MKR.util.qs('#offbar'); if(bar) bar.classList.toggle('hidden', Net.online);
    },

    async flush(){ if(MKR.db && MKR.db.flush) await MKR.db.flush(); Net.render(); },

    init(){
      window.addEventListener('online', async ()=>{ Net.online=true; Net.render(); MKR.util.toast('网络已恢复，正在静默同步…'); await Net.flush(); if(Net.pending()===0) MKR.util.toast('数据已同步至云端','green'); });
      window.addEventListener('offline',()=>{ Net.online=false; Net.render(); MKR.util.toast('网络已断开 · 已进入本地保护模式，请放心继续操作','amber'); });
      window.addEventListener('beforeunload',(e)=>{ if(dirty){ e.preventDefault(); e.returnValue='管家提示：您有未保存的数据，刷新将导致数据丢失，确定要离开吗？'; return e.returnValue; } });
      Net.render();
    }
  };
  MKR.net=Net;
})();
