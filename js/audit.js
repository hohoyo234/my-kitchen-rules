/* ===== 审计日志 (Audit Trail) =====
   只追加（append-only）结构，不可篡改、不可删除。
   记录前台所有「改单 / 取消 / 打折 / 退款」及敏感操作的人员、时间、金额。
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
        actor: sess ? sess.name : '系统',
        actorRole: sess ? sess.role : 'system',
        meta
      });
    },
    async all(){ const rows = await MKR.db.getAll('audit'); return rows.sort((a,b)=>b.ts-a.ts); },
    label(action){
      return ({
        'order.cancel':'取消订单','order.discount':'手动打折','order.refund':'退款',
        'order.create':'新建订单','order.edit':'修改订单','pay.blinddrop':'盲对账',
        'staff.offboard':'员工离职熔断','staff.hire':'招聘入职','tfn.view':'调取 TFN',
        'shift.create':'新增排班','shift.remove':'删除排班','labor.approve':'人工成本审批',
        'labor.reject':'人工成本驳回','sos.post':'发布 SOS 顶班','swap.approve':'换班审批',
        'login':'登录','export':'数据导出','super.remind':'Super 提醒'
      })[action] || action;
    }
  };
  MKR.audit = A;
})();
