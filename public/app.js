import {getClubs,availability,reserve,localDate,datePlus,durationLabel,filterClubs} from './api.js';
const $=s=>document.querySelector(s);
const escape=s=>String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let clubs=[], availabilityToday=new Map(), selectedClub=null, selectedSlot=null, slots=[], date='', minutes=60, agendaVersion=0, busy=false;
let guest;
let saved=[];
try { guest=localStorage.getItem('amatour-guest') || crypto.randomUUID(); localStorage.setItem('amatour-guest',guest); saved=JSON.parse(localStorage.getItem('amatour-bookings') || '[]'); if(!Array.isArray(saved))saved=[]; }
catch { guest=crypto.randomUUID(); }
function toast(message){ $('#toast').textContent=message; $('#toast').hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('#toast').hidden=true,5500); }
function formatDate(d){return new Intl.DateTimeFormat('es-CL',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));}
function time(value,timezone){return new Intl.DateTimeFormat('es-CL',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:timezone}).format(new Date(value));}
function countBookings(){ $('#booking-count').textContent=saved.filter(x=>new Date(x.end_at)>new Date()).length; }
function renderClubs(){
  const type=$('#court-type').value;
  let list=filterClubs(clubs,$('#club-query').value,type);
  if($('#only-available').checked)list=list.filter(c=>availabilityToday.get(c.id)?.some(s=>s.availability==='AVAILABLE' && (!type || c.courts.some(ct=>ct.id===s.court_id && (type==='indoor'?ct.is_indoor:!ct.is_indoor)))));
  $('#result-count').textContent=`${list.length} ${list.length===1?'club encontrado':'clubes encontrados'}`;
  $('#clubs-grid').innerHTML=list.length?list.map(c=>{
    const index=clubs.indexOf(c);
    const total=availabilityToday.get(c.id)?.filter(s=>s.availability==='AVAILABLE').length;
    const active=c.courts.filter(x=>x.status==='ACTIVE');
    return `<article class="club-card"><div class="club-visual tone-${index%3}" role="img" aria-label="Ilustración de cancha de pádel"><div class="mini-court"></div><span class="visual-label">PÁDEL · ${active.length} CANCHAS</span><span class="visual-number">0${index+1}</span></div><div class="card-content"><p class="card-location">⌖ ${escape(c.address)}</p><h3>${escape(c.name.replace(' · Demo',''))}</h3><div class="card-tags"><span class="tag">${active.length} canchas</span>${active.some(x=>x.is_indoor)?'<span class="tag">Techadas</span>':''}${active.some(x=>!x.is_indoor)?'<span class="tag">Al aire libre</span>':''}<span class="tag">Demo</span></div><div class="card-action"><span class="available-note"><span class="dot"></span>${total===undefined?'Consultar horarios':total>0?'Horarios disponibles hoy':'Consulta próximos días'}</span><button data-club="${escape(c.id)}" aria-label="Ver disponibilidad de ${escape(c.name)}">Ver disponibilidad <span>↗</span></button></div></div></article>`;
  }).join(''):'<div class="empty-state"><strong>No encontramos clubes con esos filtros.</strong>Prueba otra comuna o selecciona todas las canchas.</div>';
}
async function loadClubs(){
  $('#clubs-grid').innerHTML='<div class="loading-skeleton"></div><div class="loading-skeleton"></div><div class="loading-skeleton"></div>';
  try {
    clubs=await getClubs();renderClubs();
    await Promise.allSettled(clubs.map(async c=>{ const data=await availability(c.id,localDate(c.timezone),60);availabilityToday.set(c.id,data); }));renderClubs();
  } catch(e){ $('#result-count').textContent='No se pudieron cargar los clubes';$('#clubs-grid').innerHTML=`<div class="error-state">${escape(e.message)} <button class="text-button" id="retry-clubs">Reintentar</button></div>`; }
}
function openClub(id){
  selectedClub=clubs.find(c=>c.id===id); if(!selectedClub)return;
  date=localDate(selectedClub.timezone);minutes=60;selectedSlot=null;busy=false;
  $('#club-content').innerHTML=`<div class="modal-heading"><div><p class="eyebrow">TU CANCHA TE ESPERA</p><h2 id="club-title">${escape(selectedClub.name)}</h2><div class="muted">⌖ ${escape(selectedClub.address)}</div></div><button class="close-button" data-close="club-dialog" aria-label="Cerrar disponibilidad">×</button></div><div class="agenda-controls"><label>¿Qué día jugamos?<input type="date" id="booking-date" value="${date}" min="${date}" max="${datePlus(date,30)}"></label><label>¿Cuánto quieres jugar?<select id="booking-duration">${[30,60,90,120,150,180].map(n=>`<option value="${n}" ${n===minutes?'selected':''}>${durationLabel(n)}</option>`).join('')}</select></label><span class="timezone">Hora local · ${escape(selectedClub.timezone)}</span></div><div class="agenda-legend"><span class="legend-green">□ Disponible</span><span>⊘ Reservado</span><span>▧ Bloqueado</span></div><div id="agenda" class="agenda-grid" aria-live="polite"></div><div class="booking-summary"><div id="selection-summary"><strong>Elige cancha y hora</strong><div class="muted">Cada opción muestra el inicio de tu reserva completa.</div></div><button class="primary-button" id="confirm-reservation" disabled>Confirmar reserva →</button></div>`;
  $('#club-dialog').showModal();loadAgenda();
}
async function loadAgenda(){
  const version=++agendaVersion;
  selectedSlot=null; updateSelection();
  $('#agenda').innerHTML='<div class="empty-state">Consultando horarios en tiempo real…</div>';
  try {
    const data=await availability(selectedClub.id,date,minutes);if(version!==agendaVersion)return;
    slots=data;
    $('#agenda').innerHTML=selectedClub.courts.sort((a,b)=>a.court_number-b.court_number).map(c=>{
      const courtSlots=slots.filter(x=>x.court_id===c.id);
      return `<section class="court-column"><h3>${escape(c.name)}</h3><p class="muted">${c.is_indoor?'Techada':'Al aire libre'} · ${escape(c.surface_type)}</p><div class="slots">${courtSlots.length?courtSlots.map(s=>{const index=slots.indexOf(s);const status=s.availability==='AVAILABLE'?'Disponible':s.availability==='BLOCKED'?'Bloqueado':'Reservado';return `<button class="slot ${s.availability==='BLOCKED'?'blocked':''}" data-slot="${index}" ${s.availability!=='AVAILABLE'?'disabled':''} aria-label="${escape(c.name)}, ${s.local_time}, ${durationLabel(minutes)}, ${status}" title="${s.local_time} · ${status}">${s.local_time}</button>`;}).join(''):'<p class="muted">Sin horarios para esta fecha y duración.</p>'}</div></section>`;
    }).join('');
  }catch(e){if(version!==agendaVersion)return;$('#agenda').innerHTML=`<div class="error-state">${escape(e.message)} <button class="text-button" id="retry-agenda">Reintentar</button></div>`;}
}
function updateSelection(){
  const button=$('#confirm-reservation');if(!button)return;
  button.disabled=!selectedSlot || busy;button.textContent=busy?'Guardando tu reserva…':'Confirmar reserva →';
  for(const control of [$('#booking-date'),$('#booking-duration')])if(control)control.disabled=busy;
  if(selectedSlot){const court=selectedClub.courts.find(c=>c.id===selectedSlot.court_id);$('#selection-summary').innerHTML=`<strong>${escape(court.name)} · ${selectedSlot.local_time} – ${time(selectedSlot.end_at,selectedClub.timezone)}</strong><div class="muted">${formatDate(date)} · ${durationLabel(minutes)} · Sin pago en esta versión</div>`;}
  else $('#selection-summary').innerHTML='<strong>Elige cancha y hora</strong><div class="muted">Reserva como invitado, sin crear una cuenta.</div>';
}
async function confirmReservation(){
  if(!selectedSlot || busy)return;
  busy=true;updateSelection();
  const chosen={...selectedSlot};const club=selectedClub;const chosenMinutes=minutes;const chosenDate=date;
  try {
    const [booking]=await reserve(chosen.court_id,chosen.start_at,chosenMinutes,guest);
    const court=club.courts.find(c=>c.id===chosen.court_id);
    saved.unshift({...booking,club:club.name,court:court.name,timezone:club.timezone,date:chosenDate});
    try{localStorage.setItem('amatour-bookings',JSON.stringify(saved));}catch{toast('Reserva confirmada. Guarda el código: este navegador no permite almacenar tu historial.');}
    countBookings();
    $('#club-content').innerHTML=`<div class="modal-heading"><span class="eyebrow">NOS VEMOS EN LA CANCHA</span><button class="close-button" data-close="club-dialog" aria-label="Cerrar confirmación">×</button></div><div class="success-panel"><div class="success-icon">✓</div><h2 id="club-title">Tu hora ya es tuya.</h2><p class="muted">${escape(club.name)} · ${escape(court.name)}<br>${formatDate(chosenDate)}<br>${time(chosen.start_at,club.timezone)} – ${time(chosen.end_at,club.timezone)} · ${durationLabel(chosenMinutes)}</p><div class="confirmation-code">${escape(booking.reservation_id.slice(0,8).toUpperCase())}</div><p class="muted">Reserva confirmada en la base de datos.<br>Sin cobro. Club y reserva de demostración.</p><button class="primary-button" data-close="club-dialog">Listo, ¡a jugar! ↗</button></div>`;
    availabilityToday.delete(club.id);
    availability(club.id,localDate(club.timezone),60).then(data=>{availabilityToday.set(club.id,data);renderClubs();}).catch(()=>{});
  }catch(e){toast(e.message);await loadAgenda();}
  finally{busy=false;updateSelection();}
}
function openBookings(){
  $('#bookings-list').innerHTML=saved.length?saved.map(b=>`<article class="reservation-item"><strong>${escape(b.club)} · ${escape(b.court)}</strong><p>${formatDate(b.date)} · ${time(b.start_at,b.timezone)} – ${time(b.end_at,b.timezone)}</p><span class="tag">✓ Confirmada</span> <small class="muted">${escape(b.reservation_id.slice(0,8).toUpperCase())}</small></article>`).join(''):'<div class="empty-state"><strong>Tu próximo partido está por venir.</strong>Explora un club y reserva tu primera cancha.</div>';
  $('#booking-dialog').showModal();
}
document.addEventListener('click',e=>{
  const close=e.target.closest('[data-close]');if(close){if(busy){toast('Espera mientras confirmamos tu reserva.');return;}$('#'+close.dataset.close).close();agendaVersion++;return;}
  const club=e.target.closest('[data-club]');if(club){openClub(club.dataset.club);return;}
  const slot=e.target.closest('[data-slot]');if(slot&&!busy){selectedSlot=slots[Number(slot.dataset.slot)];document.querySelectorAll('.slot.selected').forEach(x=>x.classList.remove('selected'));slot.classList.add('selected');updateSelection();return;}
  if(e.target.closest('#confirm-reservation'))confirmReservation();
  if(e.target.closest('#retry-clubs'))loadClubs();
  if(e.target.closest('#retry-agenda'))loadAgenda();
});
document.addEventListener('change',e=>{
  if(e.target.id==='booking-date' || e.target.id==='booking-duration'){
    if(busy)return;date=$('#booking-date').value;minutes=Number($('#booking-duration').value);loadAgenda();
  }
});
$('#club-query').addEventListener('input',renderClubs);
$('#court-type').addEventListener('change',renderClubs);
$('#only-available').addEventListener('change',renderClubs);
$('#clear-filters').addEventListener('click',()=>{$('#club-query').value='';$('#court-type').value='';$('#only-available').checked=false;renderClubs();});
$('#hero-search-button').addEventListener('click',()=>toast('El buscador global estará disponible pronto. Ya puedes explorar los clubes y reservar más abajo.'));
$('#hero-query').addEventListener('keydown',e=>{if(e.key==='Enter')$('#hero-search-button').click();});
$('#my-bookings').addEventListener('click',openBookings);
$('#club-dialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();else agendaVersion++;});
countBookings();loadClubs();
