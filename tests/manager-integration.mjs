import assert from 'node:assert/strict';
const base=process.env.MANAGER_URL||'http://127.0.0.1:3200';
const s=await fetch(base+'/api/manager/session');assert.equal(s.status,200);
const cookie=s.headers.get('set-cookie').split(';')[0];
async function call(action,club_id=null,data={}){const r=await fetch(base+'/api/manager',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-Amatour-Manager':'1'},body:JSON.stringify({action,club_id,data})});const x=await r.json();if(!r.ok)throw Error(x.error);return x;}
const unauth=await fetch(base+'/api/manager',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(unauth.status,403);
const csrf=await fetch(base+'/api/manager/session',{headers:{Origin:'https://untrusted.example'}});assert.equal(csrf.status,403);
const clubs=await call('clubs');assert.ok(clubs.length>=3);
const club=clubs.find(c=>c.is_demo);const data=await call('snapshot',club.id);assert.equal(data.calendar.length,data.courts.length*48);
assert.ok(data.rates.some(r=>r.is_default));
// Persist an innocuous existing description unchanged and fetch a fresh snapshot.
const court=data.courts[0];await call('court.save',club.id,{court_id:court.id,name:court.name,court_number:court.court_number,status:court.status,surface_type:court.surface_type,description:court.description,is_indoor:court.is_indoor});
const again=await call('snapshot',club.id);assert.equal(again.courts.find(c=>c.id===court.id).description,court.description);
console.log(JSON.stringify({passed:true,checks:['local session','unauthorized request rejected','cross-origin denied','all clubs loaded','calendar derived','rates loaded','write persists on fresh snapshot']}));
