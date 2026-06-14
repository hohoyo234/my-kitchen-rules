/* ===== 法定薪资参考计算 =====
   依据澳洲餐饮业 Award 思路：按工时类型 + 星期/公众假期切分费率。
   注意：这是“参考计算”，发薪前必须由雇主人工确认（界面已含确认步骤与免责声明）。
   实际费率请以 Fair Work 最新 Restaurant Industry Award 为准。
*/
window.MKR = window.MKR || {};
(function(){
  // 日类型倍率（示意值，供参考）
  const MULT = {
    weekday:   {label:'平日',     casual:1.0,  parttime:1.0, fulltime:1.0},
    saturday:  {label:'周六',     casual:1.25, parttime:1.25,fulltime:1.25},
    sunday:    {label:'周日',     casual:1.5,  parttime:1.5, fulltime:1.5},
    holiday:   {label:'公众假期', casual:2.25, parttime:2.25,fulltime:2.25},
  };
  const PUBLIC_HOLIDAYS = []; // ISO 日期串，可在设置中补充

  // 青少年费率（按年龄占成人比例，示意值，供参考）——餐饮业 Award junior rates 思路
  function juniorPct(age){
    if(age==null) return 1;            // 未知年龄按成人
    if(age<16) return 0.50;
    if(age===16) return 0.50;
    if(age===17) return 0.60;
    if(age===18) return 0.70;
    if(age===19) return 0.80;
    if(age===20) return 0.90;
    return 1;                          // 21+ 成人全额
  }

  function dayType(ts){
    const d = new Date(ts); const iso = new Date(ts).toISOString().slice(0,10);
    if(PUBLIC_HOLIDAYS.includes(iso)) return 'holiday';
    const wd = d.getDay();
    if(wd===6) return 'saturday'; if(wd===0) return 'sunday'; return 'weekday';
  }
  function hours(start,end){
    const [sh,sm]=start.split(':').map(Number), [eh,em]=end.split(':').map(Number);
    return Math.max(0, (eh*60+em-sh*60-sm)/60);
  }
  // 单个班次薪资（年龄 + 工时类型 + 平日/周末/公众假期）
  function shiftPay(staff, shift, ts){
    const t = dayType(ts);
    const mult = (MULT[t][staff.employment] || 1.0);
    const jp = juniorPct(staff.age);
    const h = hours(shift.start, shift.end);
    const rate = staff.baseRate * mult * jp;          // baseRate 视为成人基准
    return { hours:h, rate, dayType:t, dayLabel:MULT[t].label, juniorPct:jp, pay: h*rate };
  }
  MKR.pay = { MULT, dayType, hours, juniorPct, shiftPay };
})();
