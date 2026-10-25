// Public publishable key only. No service role or private credential in browser.
const URL = 'https://prrfytdglzozamvjffxx.supabase.co/rest/v1';
const KEY = 'sb_publishable_Q6CEgQn4XwPK_-6sV21FzA_JPnKMzPZ';
async function request(path, body) {
  const response = await fetch(URL + path, {
    method: body ? 'POST' : 'GET',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'No pudimos conectarnos. Intenta nuevamente.');
  return data;
}
export const getClubs = () => request('/clubs?select=id,name,slug,address,timezone,courts(id,name,court_number,is_indoor,surface_type,status,description)&order=name.asc');
export const availability = (club,date,minutes) => request('/rpc/court_availability',{p_club:club,p_date:date,p_minutes:Number(minutes)});
export const reserve = (court,start,minutes,guest) => request('/rpc/reserve_guest',{p_court:court,p_start:start,p_minutes:Number(minutes),p_guest:guest});
export function localDate(timezone, date = new Date()) {
  return new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
export function datePlus(date,days) {
  const d=new Date(date+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10);
}
export function durationLabel(minutes) {
  return minutes < 60 ? `${minutes} min` : minutes % 60 ? `${Math.floor(minutes/60)} h 30 min` : `${minutes/60} ${minutes === 60 ? 'hora' : 'horas'}`;
}
export function filterClubs(clubs,query,type) {
  const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return clubs.filter(c=>normalize(c.name+' '+c.address).includes(normalize(query.trim())) && (!type || c.courts.some(ct=>type === 'indoor' ? ct.is_indoor : !ct.is_indoor)));
}
