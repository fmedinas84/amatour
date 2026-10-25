// Explicit live integration check against the three approved demo clubs.
// Leaves only the successful test reservations, which are cancelled afterwards
// by the operator using their returned identifiers.
import assert from 'node:assert/strict';
import {getClubs,availability,reserve,localDate,datePlus} from '../public/api.js';
const clubs=await getClubs();
assert.equal(clubs.filter(c=>c.slug.startsWith('demo-')).length,3);
const club=clubs.find(c=>c.slug==='demo-bosque');
const day=datePlus(localDate(club.timezone),2);
const slots=await availability(club.id,day,30);
const slot=slots.find(s=>s.availability==='AVAILABLE');
assert.ok(slot);
for(const minutes of [0,45,181,210]) await assert.rejects(()=>reserve(slot.court_id,slot.start_at,minutes,crypto.randomUUID()));
const outcomes=await Promise.allSettled([
 reserve(slot.court_id,slot.start_at,30,crypto.randomUUID()),
 reserve(slot.court_id,slot.start_at,30,crypto.randomUUID()),
]);
assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1,'Exactly one concurrent booking must win');
assert.equal(outcomes.filter(x=>x.status==='rejected').length,1);
const after=await availability(club.id,day,30);
assert.equal(after.find(x=>x.court_id===slot.court_id&&x.start_at===slot.start_at).availability,'RESERVED');
const winner=outcomes.find(x=>x.status==='fulfilled').value[0];
console.log(JSON.stringify({passed:true,checks:['catalog','30-minute availability','invalid durations','concurrent conflict','persisted occupancy'],testReservation:winner}));
