import {demoPlayer,demoReservations} from './profile-data.js';
import {esc,amount} from './manager-utils.js';
const PAGE_SIZE=5;
document.querySelector('#player-name').textContent=demoPlayer.name;
document.querySelector('#player-age').textContent=`${demoPlayer.age} años`;
document.querySelector('#player-gsr').textContent=new Intl.NumberFormat('es-CL').format(demoPlayer.gsr);
const photo=document.querySelector('.player-photo');
photo.addEventListener('error',()=>{photo.hidden=true;});
const reservations=demoReservations();
for(const group of ['active','past']){
  let visible=PAGE_SIZE;
  const list=document.querySelector(`#${group}-reservations`),more=document.querySelector(`#${group}-more`);
  const rows=reservations[group];
  document.querySelector(`#${group}-count`).textContent=rows.length;
  function render(){
    list.innerHTML=rows.slice(0,visible).map(row=>{
      const date=new Date(row.date+'T12:00:00Z');
      const month=new Intl.DateTimeFormat('es-CL',{month:'short',timeZone:'UTC'}).format(date).replace('.','');
      const fullDate=new Intl.DateTimeFormat('es-CL',{dateStyle:'full',timeZone:'UTC'}).format(date);
      return `<li class="profile-booking"><div class="booking-date" aria-label="${esc(fullDate)}"><strong>${date.getUTCDate()}</strong><span>${month}</span></div><div class="profile-booking-detail"><h3>${esc(row.club)}</h3><p>${esc(row.court)} <span aria-hidden="true">·</span> ${row.start}–${row.end} <span aria-hidden="true">·</span> ${row.duration} min</p><small>${row.date.slice(0,4)} · ${row.id}</small></div><div class="profile-booking-meta"><span class="booking-state ${row.status==='Cancelada'?'cancelled':group==='past'?'finished':''}">${row.status}</span><strong>${amount(row.amount)}</strong><small>Valor de prueba</small></div></li>`;
    }).join('');
    document.querySelector(`#${group}-shown`).textContent=`Mostrando ${Math.min(visible,rows.length)} de ${rows.length} reservas`;
    more.hidden=visible>=rows.length;
  }
  more.addEventListener('click',()=>{visible+=PAGE_SIZE;render();});
  render();
}
