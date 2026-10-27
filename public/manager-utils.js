export const days=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function clock(n){return `${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;}
export function minute(s){if(!/^\d{2}:\d{2}$/.test(s))throw Error('Hora inválida.');const[h,m]=s.split(':').map(Number);if(h>23||m>59||m%30!==0)throw Error('Usa horas en bloques de 30 minutos.');return h*60+m;}
export function windowRange(start,end){const a=minute(start),b=minute(end);return {start_min:a,end_min:b<=a?b+1440:b};}
export function amount(n,c='CLP'){return n===null||n===undefined?'Sin precio configurado':new Intl.NumberFormat('es-CL',{style:'currency',currency:c,maximumFractionDigits:c==='CLP'?0:2}).format(n);}
export function localStamp(iso,tz){const p=new Intl.DateTimeFormat('sv-SE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));return p.replace(' ','T');}
export function addMinutesLocal(value,n){return new Date(new Date(value+'Z').getTime()+n*60000).toISOString().slice(0,16);}
export const states={AVAILABLE:'Disponible',RESERVED:'Reservada',PENDING:'Pendiente',BLOCKED:'Bloqueada',CLOSED:'Fuera de horario'};
export function activeReservation(r){return r.status==='CONFIRMED'||(r.status==='PENDING'&&new Date(r.expires_at)>new Date());}
export function matrixRate(schedules,rates,court,day,start,end){const slices=[];for(let n=start;n<end;n+=30){const s=schedules.find(s=>s.court_id===court&&s.weekday===day&&s.start_min<=n&&s.end_min>=n+30);const rate=rates.find(r=>r.is_active&&r.id===s?.rate_plan_id)||rates.find(r=>r.is_active&&r.is_default);slices.push(rate?.id||null);}return new Set(slices).size>1?{alias:'Mixta',mixed:true}:rates.find(r=>r.id===slices[0])||{alias:'Sin tarifa'};}
