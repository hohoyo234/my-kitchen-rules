/* ===== 登录页（账号 + 密码）===== */
window.MKR = window.MKR || {}; MKR.portals = MKR.portals || {};
(function(){
  const U = MKR.util;
  const QUICK = {owner:{u:'boss',p:'boss1111'}, manager:{u:'mgr',p:'mgr2222'}, staff:{u:'amy',p:'amy3333'}};

  MKR.portals.login = {
    render(root){
      let role='owner';
      root.innerHTML = `
      <div class="login-wrap">
        <div class="card login-card">
          <div class="row center gap8"><div class="login-logo">M</div>
            <div><b style="font-size:18px">My Kitchen Rules</b><div class="faint" style="font-size:12.5px">餐厅全能管家 · 安全登录</div></div></div>

          <div class="role-pick mt24" id="rolePick">
            <button data-r="owner" class="sel"><span class="em">👑</span>老板</button>
            <button data-r="manager"><span class="em">📋</span>经理</button>
            <button data-r="staff"><span class="em">🧑‍🍳</span>员工</button>
          </div>

          <div class="field"><label>账号</label><input class="input" id="lu" value="boss" autocomplete="username"></div>
          <div class="field"><label>密码</label><input class="input" id="lp" type="password" value="boss1111" autocomplete="current-password"></div>
          <div id="lerr" class="alert red hidden" style="margin-bottom:12px"></div>
          <button class="btn btn-dark btn-block" id="lbtn">登录</button>

          <div class="seed-hint">
            <b>演示账号(点角色自动填充):</b><br>
            👑 老板 <code>boss</code> / <code>boss1111</code><br>
            📋 经理 <code>mgr</code> / <code>mgr2222</code><br>
            🧑‍🍳 员工 <code>amy/kevin/leo</code> / <code>amy3333…</code><br>
            <span class="faint">每个账号独立、数据库按角色隔离;离职后立即失效。</span>
          </div>
        </div>
      </div>`;

      const pick=U.qs('#rolePick',root), lu=U.qs('#lu',root), lp=U.qs('#lp',root), err=U.qs('#lerr',root), btn=U.qs('#lbtn',root);
      U.qsa('button[data-r]',pick).forEach(b=> b.onclick=()=>{
        U.qsa('button[data-r]',pick).forEach(x=>x.classList.remove('sel')); b.classList.add('sel');
        role=b.dataset.r; lu.value=QUICK[role].u; lp.value=QUICK[role].p; err.classList.add('hidden');
      });

      async function doLogin(){
        err.classList.add('hidden'); btn.disabled=true; btn.textContent='登录中…';
        const res = await MKR.auth.login(lu.value, lp.value);
        if(!res.ok){ err.textContent='⚠️ '+res.msg; err.classList.remove('hidden'); btn.disabled=false; btn.textContent='登录'; return; }
        btn.textContent='加载数据…';
        try{ await MKR.db.initSync(); await MKR.seed.ensure(); }catch(e){}
        location.hash = `#/${res.user.role}/${MKR.portals[res.user.role].home}`;
      }
      btn.onclick=doLogin;
      lp.addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });
    }
  };
})();
