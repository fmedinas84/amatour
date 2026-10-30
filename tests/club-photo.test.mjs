import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePhotoFile} from '../public/club-photo.js';
import {managerOperation} from '../manager-server.mjs';
test('club photo input accepts supported formats and rejects oversized or active files',()=>{
 for(const type of ['image/jpeg','image/png','image/webp'])assert.doesNotThrow(()=>validatePhotoFile({type,size:1000}));
 for(const type of ['image/svg+xml','text/html','application/pdf','image/gif'])assert.throws(()=>validatePhotoFile({type,size:1000}));
 assert.throws(()=>validatePhotoFile({type:'image/jpeg',size:8*1024*1024+1}));
 assert.throws(()=>validatePhotoFile(null));
});
test('club photo updates use the existing capability-protected gateway',async()=>{
 const result=await managerOperation({action:'club.photo',club_id:'demo',data:{photo_data_url:'test-image'}},'server-secret',async(url,options)=>{
  const input=JSON.parse(options.body);assert.equal(input.p_token,'server-secret');assert.equal(input.p_action,'club.photo');assert.equal(input.p_club,'demo');assert.equal(input.p_data.photo_data_url,'test-image');return Response.json({message:'Guardado'});
 });assert.equal(result.status,200);
});
