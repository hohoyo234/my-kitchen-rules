/* ===== Indicative award pay calculation =====
   Based on the Australian hospitality award model: rates split by employment
   type and weekday / weekend / public holiday.
   NOTE: this is an INDICATIVE calculation — the employer must confirm before
   pay runs (the UI includes a confirmation step and disclaimers).
   Rates are OWNER-CONFIGURABLE: stored in settings.payRates and loaded via
   MKR.pay.load(); they fall back to these defaults.
*/
window.MKR = window.MKR || {};
(function(){
  const LABELS = { weekday:'Weekday', saturday:'Saturday', sunday:'Sunday', holiday:'Public holiday' };
  // Day-type multipliers + junior age tiers (indicative defaults; owner can edit)
  const DEFAULTS = {
    day: { weekday:1.0, saturday:1.25, sunday:1.5, holiday:2.25 },
    junior: { 16:0.50, 17:0.60, 18:0.70, 19:0.80, 20:0.90 },   // <16 → 16 tier; 21+ → 1.0 (adult)
    publicHolidays: [],   // ISO date strings
  };
  let RATES = JSON.parse(JSON.stringify(DEFAULTS));

  // Junior rate (share of adult rate by age)
  function juniorPct(age){
    if(age==null) return 1;            // unknown age → adult
    const j = RATES.junior || {};
    if(age<=16) return j[16]!=null?j[16]:0.5;
    if(age>=21) return 1;
    return j[age]!=null ? j[age] : 1;
  }

  function dayType(ts){
    const d = new Date(ts); const iso = new Date(ts).toISOString().slice(0,10);
    if((RATES.publicHolidays||[]).includes(iso)) return 'holiday';
    const wd = d.getDay();
    if(wd===6) return 'saturday'; if(wd===0) return 'sunday'; return 'weekday';
  }
  function hours(start,end){
    const [sh,sm]=start.split(':').map(Number), [eh,em]=end.split(':').map(Number);
    return Math.max(0, (eh*60+em-sh*60-sm)/60);
  }
  // Pay for one shift (age + weekday / weekend / public holiday)
  function shiftPay(staff, shift, ts){
    const t = dayType(ts);
    const mult = (RATES.day && RATES.day[t]!=null) ? RATES.day[t] : 1.0;
    const jp = juniorPct(staff.age);
    const h = hours(shift.start, shift.end);
    const rate = (staff.baseRate||0) * mult * jp;          // baseRate is the adult baseline
    return { hours:h, rate, dayType:t, dayLabel:LABELS[t], mult, juniorPct:jp, pay: h*rate };
  }

  // Load owner-configured rates from settings (call at boot / after save)
  async function load(){
    try{
      const s = await MKR.db.meta('settings') || {};
      const pr = s.payRates;
      if(pr){
        RATES = {
          day: {...DEFAULTS.day, ...(pr.day||{})},
          junior: {...DEFAULTS.junior, ...(pr.junior||{})},
          publicHolidays: pr.publicHolidays || s.publicHolidays || DEFAULTS.publicHolidays,
        };
      }
    }catch(e){}
    return RATES;
  }

  // Back-compat: some views referenced MKR.pay.MULT — expose a derived view.
  const MULT = new Proxy({}, { get:(_,t)=> t==='label'?undefined:({label:LABELS[t], casual:(RATES.day||{})[t], parttime:(RATES.day||{})[t], fulltime:(RATES.day||{})[t]}) });

  MKR.pay = { MULT, LABELS, DEFAULTS, dayType, hours, juniorPct, shiftPay, load, rates:()=>RATES };
})();
