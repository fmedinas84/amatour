// Isolated demo fixture: no real users, reservations or GSR are read or changed.
export const demoPlayer={name:'Tomás Morales',age:29,gsr:10840};
const clubs=['Club Bosque · Demo','Club Cordillera · Demo','Club Parque · Demo'];
export function demoReservations(now=new Date()){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const dateAt=offset=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);};
  const make=(index,past)=>({id:`DEMO-${past?'P':'A'}-${index+1}`,club:clubs[index%clubs.length],court:`Cancha ${index%3+1}`,date:dateAt((past?-1:1)*(index*3+1)),start:index%2?'19:00':'18:00',end:index%2?'20:30':'19:30',duration:90,amount:24000+index%3*3000,status:past?(index===3?'Cancelada':'Finalizada'):'Confirmada'});
  return {active:Array.from({length:8},(_,i)=>make(i,false)),past:Array.from({length:12},(_,i)=>make(i,true))};
}
