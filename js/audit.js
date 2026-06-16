/* ===== Audit Trail =====
   Append-only structure — tamper-proof, never deleted.
   Records every sensitive POS action (edit / cancel / discount / refund) with
   the actor, time and amount.
*/
window.MKR = window.MKR || {};
(function(){
  const A = {
    // action: 'order.cancel' | 'order.discount' | 'order.refund' | 'pay.blinddrop' |
    //         'staff.offboard' | 'tfn.view' | 'shift.create' | 'labor.approve' ...
    async log({action, desc, amount=null, target=null, meta=null}){
      const sess = MKR.auth.current();
      return MKR.db.append('audit', {
        action, desc,
        amount,
        target,
        actor: sess ? sess.name : 'System',
        actorRole: sess ? sess.role : 'system',
        meta
      });
    },
    async all(){ const rows = await MKR.db.getAll('audit'); return rows.sort((a,b)=>b.ts-a.ts); },
    label(action){
      return ({
        'order.cancel':'Cancel order','order.discount':'Manual discount','order.refund':'Refund',
        'order.create':'New order','order.edit':'Edit order','pay.blinddrop':'Blind drop',
        'staff.offboard':'Offboard staff','staff.hire':'Hire / onboard','tfn.view':'Reveal TFN',
        'shift.create':'Add shift','shift.remove':'Remove shift','labor.approve':'Approve labor cost',
        'labor.reject':'Reject labor cost','sos.post':'Post SOS shift','swap.approve':'Approve swap',
        'login':'Sign in','export':'Export data','super.remind':'Super reminder',
        'menu.add':'Add menu item','menu.edit':'Edit menu item','menu.remove':'Remove menu item',
        'settings.update':'Update settings','kitchen.create':'Create kitchen','kitchen.approve':'Approve kitchen'
      })[action] || action;
    }
  };
  MKR.audit = A;
})();
