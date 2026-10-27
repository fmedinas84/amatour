import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSession,validSession,handleHostedManager} from '../hosted-manager.mjs';
const origin='https://example.test';
const env={AMATOUR_MANAGER_TOKEN:'test-capability',AMATOUR_MANAGER_ACCESS_HASH:createHash('sha256').update('test-access').digest('hex'),AMATOUR_MANAGER_SESSION_SECRET:'test-signing-secret',AMATOUR_MANAGER_ORIGIN:origin};
function request(path='/api/manager',options={}){return new Request(origin+path,{method:'POST',headers:{origin,'x-amatour-manager':'1','content-type':'application/json',...options.headers},body:JSON.stringify(options.body||{action:'clubs'})});}
test('signed sessions survive function instances, expire and reject tampering',()=>{
 const now=Date.now(),session=createSession(env.AMATOUR_MANAGER_SESSION_SECRET,now);
 assert.equal(validSession(session,env.AMATOUR_MANAGER_SESSION_SECRET,now),true);
 assert.equal(validSession(session,env.AMATOUR_MANAGER_SESSION_SECRET,now+8*3600000),false);
 assert.equal(validSession(session+'x',env.AMATOUR_MANAGER_SESSION_SECRET,now),false);
 assert.equal(validSession(session,'different-secret',now),false);
});
test('anonymous and cross-origin requests never reach the database',async()=>{
 const upstream=()=>{throw Error('Must not call upstream');};
 assert.equal((await handleHostedManager(request(),env,upstream)).status,401);
 assert.equal((await handleHostedManager(request(undefined,{headers:{origin:'https://attacker.test'}}),env,upstream)).status,403);
 assert.equal((await handleHostedManager(new Request('https://other.test/api/manager'),env,upstream)).status,403);
 assert.equal((await handleHostedManager(request(),{},upstream)).status,503);
});
test('access key creates a secure cookie and never returns secrets',async()=>{
 const bad=await handleHostedManager(request('/api/manager/session',{body:{access_key:'wrong'}}),env);
 assert.equal(bad.status,401);
 const good=await handleHostedManager(request('/api/manager/session',{body:{access_key:'test-access'}}),env);
 assert.equal(good.status,200);const cookie=good.headers.get('set-cookie');
 for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/','Max-Age=28800'])assert.ok(cookie.includes(flag));
 const text=await good.text();assert.ok(!text.includes('test-access'));assert.ok(!text.includes('test-capability'));
});
test('authenticated operations reuse the gateway and forward its persistence result',async()=>{
 const cookie='__Host-amatour_manager='+createSession(env.AMATOUR_MANAGER_SESSION_SECRET);
 const result=await handleHostedManager(request(undefined,{headers:{cookie},body:{action:'rate.save',club_id:'demo',data:{alias:'Valle'}}}),env,async(url,options)=>{
  const body=JSON.parse(options.body);assert.equal(body.p_token,'test-capability');assert.equal(body.p_action,'rate.save');assert.equal(body.p_club,'demo');
  return Response.json({id:'persisted-rate'});
 });
 assert.deepEqual(await result.json(),{id:'persisted-rate'});
 const invalid=await handleHostedManager(request(undefined,{headers:{cookie},body:{action:'unknown'}}),env,()=>{throw Error('Should not call');});assert.equal(invalid.status,400);
});
test('session status and logout do not expose data or issue an automatic login',async()=>{
 const result=await handleHostedManager(new Request(origin+'/api/manager/session'),env);assert.equal((await result.json()).enabled,false);assert.equal(result.headers.get('set-cookie'),null);
 const logout=await handleHostedManager(new Request(origin+'/api/manager/session',{method:'DELETE',headers:{origin,'x-amatour-manager':'1'}}),env);assert.ok(logout.headers.get('set-cookie').includes('Max-Age=0'));
});
