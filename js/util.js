/* ===== 工具函数 ===== */
window.MKR = window.MKR || {};
(function(){
  const U = {};

  U.money = (n)=> '$' + (Number(n)||0).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2});
  U.money0 = (n)=> '$' + Math.round(Number(n)||0).toLocaleString('en-AU');
  U.uid = (p='id')=> p+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  U.now = ()=> Date.now();
  U.todayISO = ()=> new Date().toISOString().slice(0,10);

  U.fmtTime = (ts)=>{ const d=new Date(ts); return d.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}); };
  U.fmtDate = (ts)=>{ const d=new Date(ts); return `${d.getMonth()+1}月${d.getDate()}日`; };
  U.fmtDateTime = (ts)=> U.fmtDate(ts)+' '+U.fmtTime(ts);
  U.ago = (ts)=>{ const s=Math.floor((Date.now()-ts)/1000);
    if(s<60) return s+' 秒前'; if(s<3600) return Math.floor(s/60)+' 分钟前';
    if(s<86400) return Math.floor(s/3600)+' 小时前'; return Math.floor(s/86400)+' 天前'; };
  U.mins = (ts)=> Math.floor((Date.now()-ts)/60000);

  // escape
  U.esc = (s)=> String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // create element from html string -> first element
  U.el = (html)=>{ const t=document.createElement('template'); t.innerHTML=html.trim(); return t.content.firstElementChild; };
  U.qs = (sel,root=document)=> root.querySelector(sel);
  U.qsa = (sel,root=document)=> Array.from(root.querySelectorAll(sel));

  U.initials = (name='')=>{ name=name.trim(); if(/[一-龥]/.test(name)) return name.slice(-2); return name.slice(0,2).toUpperCase()||'？'; };

  // toast
  U.toast = (msg,type='')=>{
    let wrap = U.qs('.toast-wrap'); if(!wrap){ wrap=U.el('<div class="toast-wrap"></div>'); document.body.appendChild(wrap); }
    const t = U.el(`<div class="toast ${type}">${U.esc(msg)}</div>`); wrap.appendChild(t);
    setTimeout(()=>{ t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),300); }, 2600);
  };

  // modal — returns {close}; body is html string or node; opts.actions = [{label,class,onClick(close)}]
  U.modal = (title, body, opts={})=>{
    const back = U.el(`<div class="modal-back"></div>`);
    const m = U.el(`<div class="modal">
      <div class="modal-head"><h3>${U.esc(title)}</h3><button class="x" aria-label="关闭">×</button></div>
      <div class="modal-body"></div></div>`);
    const bodyEl = U.qs('.modal-body', m);
    if(typeof body==='string') bodyEl.innerHTML = body; else bodyEl.appendChild(body);
    if(opts.actions){
      const row = U.el(`<div class="row mt16" style="justify-content:flex-end"></div>`);
      opts.actions.forEach(a=>{
        const b=U.el(`<button class="btn ${a.class||'btn-ghost'}">${U.esc(a.label)}</button>`);
        b.onclick=()=>a.onClick(close); row.appendChild(b);
      });
      bodyEl.appendChild(row);
    }
    back.appendChild(m);
    function close(){ back.style.opacity='0'; back.style.transition='opacity .2s'; setTimeout(()=>back.remove(),200); }
    U.qs('.x',m).onclick=close;
    back.onclick=(e)=>{ if(e.target===back && opts.dismissable!==false) close(); };
    document.body.appendChild(back);
    return { close, el:m, body:bodyEl };
  };

  // simple confirm
  U.confirm = (title, msg, opts={})=> new Promise(res=>{
    U.modal(title, `<p class="muted">${U.esc(msg)}</p>`, { actions:[
      {label:opts.cancel||'取消', class:'btn-ghost', onClick:(c)=>{ c(); res(false); }},
      {label:opts.ok||'确认', class:opts.danger?'btn-danger':'btn-dark', onClick:(c)=>{ c(); res(true); }},
    ]});
  });

  MKR.util = U;
})();
