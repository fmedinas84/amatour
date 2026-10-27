import test from 'node:test';import assert from 'node:assert/strict';
import {minute,windowRange,clock,matrixRate} from '../public/manager-utils.js';
import {trustedLocalRequest} from '../manager-server.mjs';
test('multiple and overnight windows use next-day minute offsets',()=>{assert.deepEqual(windowRange('20:00','01:00'),{start_min:1200,end_min:1500});assert.deepEqual(windowRange('08:00','13:00'),{start_min:480,end_min:780});assert.equal(clock(1500),'01:00');assert.throws(()=>minute('08:15'));});
test('matrix detects mixed pricing and default fallback',()=>{const rates=[{id:'d',alias:'Default',is_active:true,is_default:true},{id:'p',alias:'Peak',is_active:true}];const s=[{court_id:'c',weekday:0,start_min:1080,end_min:1380,rate_plan_id:'p'}];assert.equal(matrixRate(s,rates,'c',0,1050,1110).mixed,true);assert.equal(matrixRate(s,rates,'c',0,1080,1140).id,'p');assert.equal(matrixRate(s,rates,'c',1,1080,1140).id,'d');});
test('server rejects external origins, hosts and DNS rebinding',()=>{assert.equal(trustedLocalRequest({headers:{host:'127.0.0.1:3200',origin:'http://127.0.0.1:3200'}},3200),true);assert.equal(trustedLocalRequest({headers:{host:'127.0.0.1:3200',origin:'https://evil.example'}},3200),false);assert.equal(trustedLocalRequest({headers:{host:'evil.example:3200'}},3200),false);});
import {calendarRate} from '../public/manager-utils.js';
test('calendar prices follow local date, promotion priority, weekly schedule and active fallback',()=>{
 const s={club:{timezone:'America/Santiago'},rates:[{id:'d',is_active:true,is_default:true,amount:4000},{id:'w',is_active:true,amount:6000},{id:'p',is_active:true,amount:3000},{id:'off',is_active:false}],schedules:[{court_id:'c',weekday:0,start_min:1080,end_min:1140,rate_plan_id:'w'}],overrides:[]};
 assert.equal(calendarRate(s,'c','2026-10-26T21:00:00Z').amount,6000);
 const promo={id:'a',court_id:'c',date_from:'2026-10-26',date_to:'2026-10-26',weekdays:[0],start_min:1080,end_min:1110,priority:1,rate_plan_id:'p'};
 s.overrides=[promo,{...promo,id:'b',priority:2,rate_plan_id:'d'},{...promo,id:'z',priority:99,rate_plan_id:'off'}];
 assert.equal(calendarRate(s,'c','2026-10-26T21:00:00Z').amount,4000);
 s.overrides=[promo];assert.equal(calendarRate(s,'c','2026-10-26T21:00:00Z').amount,3000);
 assert.equal(calendarRate(s,'c','2026-10-26T21:30:00Z').amount,6000);
 assert.equal(calendarRate(s,'c','2026-10-27T02:00:00Z').amount,4000);
 s.rates=[];assert.equal(calendarRate(s,'c','2026-10-26T21:00:00Z'),null);
});
