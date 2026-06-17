/* ===== Shared UI: inline SVG icon set =====
   One consistent, crisp icon set used across the sidebar/mobile nav (and anywhere
   else that wants an icon) instead of emoji. Stroke-based, inherits currentColor.
*/
window.MKR = window.MKR || {};
(function(){
  const P = {
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    bars:'<path d="M3 20h18"/><path d="M7 20v-5M12 20v-9M17 20v-13"/>',
    users:'<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.5a3 3 0 0 1 0 5.5M22 20a6 6 0 0 0-4.5-5.8"/>',
    building:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>',
    star:'<path d="M12 3l2.7 5.5 6 .9-4.35 4.2 1 6L12 17l-5.35 2.6 1-6L3.3 9.4l6-.9z"/>',
    eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 13a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 13H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 7L4.6 7a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 3.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    calendar:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
    calcheck:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/><path d="M9 15l2 2 4-4"/>',
    userplus:'<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M18 8v6M21 11h-6"/>',
    utensils:'<path d="M5 3v6a2 2 0 0 0 4 0V3M7 9v12"/><path d="M16.5 3C15 3 14 5 14 7.5s1 4 2.5 4V21"/>',
    checksq:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 12l3 3 5-6"/>',
    repeat:'<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
    receipt:'<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    monitor:'<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
    qr:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M20.5 14v.01M17 20.5h.01M20.5 17.5v3.5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    idcard:'<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="11" r="2.2"/><path d="M4.5 16a3.5 3.5 0 0 1 7 0M14.5 9.5h5M14.5 13.5h5"/>',
    inbox:'<path d="M3 13h5l1 3h6l1-3h5"/><path d="M5 5h14l2 8v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5z"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
    avg:'<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.6 9.4a2.4 2 0 0 1 4.8 0c0 1.3-1.2 1.7-2.4 2.2s-2.4 1-2.4 2.4a2.4 2 0 0 0 4.8 0"/>',
    trend:'<path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v6h-6"/>',
    dot:'<circle cx="12" cy="12" r="3.5"/>',
  };

  // nav id -> icon name
  const NAV = {
    dashboard:'grid', analytics:'trend', report:'mail', alerts:'bell', audit:'shield', labor:'bars',
    team:'users', branches:'building', compliance:'shield', feedback:'star',
    switch:'eye', settings:'gear', setup:'gear',
    schedule:'calendar', myshifts:'calcheck', my:'calcheck', hire:'userplus',
    menu:'utensils', tasks:'checksq', swaps:'repeat', pos:'receipt', kds:'monitor', qr:'qr',
    availability:'clock', market:'repeat', me:'idcard',
    applications:'inbox', restaurants:'building',
  };

  function icon(name, cls=''){
    const inner = P[name] || P.dot;
    return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  }
  function navIcon(id){ return icon(NAV[id] || 'dot'); }

  MKR.ui = { icon, navIcon, ICONS:P, NAV };
})();
