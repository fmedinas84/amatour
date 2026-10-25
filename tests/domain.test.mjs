import test from 'node:test';
import assert from 'node:assert/strict';
import {filterClubs,localDate,datePlus,durationLabel} from '../public/api.js';
test('filters accents, club address and indoor/outdoor courts',()=>{
 const clubs=[{name:'Parque',address:'Peñalolén',courts:[{is_indoor:false}]},{name:'Bosque',address:'Las Condes',courts:[{is_indoor:true}]}];
 assert.equal(filterClubs(clubs,'penalolen','outdoor').length,1);
 assert.equal(filterClubs(clubs,'penalolen','indoor').length,0);
 assert.equal(filterClubs(clubs,'bosque','indoor').length,1);
 assert.equal(filterClubs(clubs,'','').length,2);
});
test('uses club timezone rather than browser timezone',()=>{
 assert.equal(localDate('America/Santiago',new Date('2026-10-25T01:00:00Z')),'2026-10-24');
 assert.equal(localDate('Asia/Tokyo',new Date('2026-10-25T01:00:00Z')),'2026-10-25');
});
test('date limits cross month and year boundaries',()=>{
 assert.equal(datePlus('2026-12-31',1),'2027-01-01');
 assert.equal(datePlus('2026-10-24',30),'2026-11-23');
});
test('six supported durations have readable labels',()=>{
 assert.deepEqual([30,60,90,120,150,180].map(durationLabel),['30 min','1 hora','1 h 30 min','2 horas','2 h 30 min','3 horas']);
});
