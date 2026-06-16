/* ===== Indicative award pay calculation =====
   Based on the Australian hospitality award model: rates split by employment
   type and weekday / weekend / public holiday.
   NOTE: this is an INDICATIVE calculation — the employer must confirm before
   pay runs (the UI includes a confirmation step and disclaimers).
   Use the latest Fair Work Restaurant Industry Award for real rates.
*/
window.MKR = window.MKR || {};
(function(){
  // Day-type multipliers (indicative values for reference)
  const MULT = {
    weekday:   {label:'Weekday',        casual:1.0,  parttime:1.0, fulltime:1.0},
    saturday:  {label:'Saturday',       casual:1.25, parttime:1.25,fulltime:1.25},
    sunday:    {label:'Sunday',         casual:1.5,  parttime:1.5, fulltime:1.5},
    holiday:   {label:'Public holiday', casual:2.25, parttime:2.25,fulltime:2.25},
  };
  const PUBLIC_HOLIDAYS = []; // ISO date strings, configurable in settings

  // Junior rates (share of adult rate by age — indicative award junior rates)
  function juniorPct(age){
    if(age==null) return 1;            // unknown age → treated as adult
    if(age<16) return 0.50;
    if(age===16) return 0.50;
    if(age===17) return 0.60;
    if(age===18) return 0.70;
    if(age===19) return 0.80;
    if(age===20) return 0.90;
    return 1;                          // 21+ full adult rate
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
  // Pay for one shift (age + employment type + weekday / weekend / public holiday)
  function shiftPay(staff, shift, ts){
    const t = dayType(ts);
    const mult = (MULT[t][staff.employment] || 1.0);
    const jp = juniorPct(staff.age);
    const h = hours(shift.start, shift.end);
    const rate = staff.baseRate * mult * jp;          // baseRate is the adult baseline
    return { hours:h, rate, dayType:t, dayLabel:MULT[t].label, juniorPct:jp, pay: h*rate };
  }
  MKR.pay = { MULT, dayType, hours, juniorPct, shiftPay };
})();
