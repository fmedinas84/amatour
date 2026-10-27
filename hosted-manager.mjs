import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {managerOperation} from './manager-server.mjs';

const COOKIE='__Host-amatour_manager';
const SESSION_SECONDS=8*60*60;
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const signature=(payload,key)=>createHmac('sha256',key).update(payload).digest('base64url');
export function createSession(key,now=Date.now()){
 const payload=Buffer.from(JSON.stringify({expires:Math.floor(now/1000)+SESSION_SECONDS,nonce:randomBytes(16).toString('hex')})).toString('base64url');
 return payload+'.'+signature(payload,key);
}
export function validSession(value,key,now=Date.now()){
 try{
  const [payload,sig,...extra]=(value||'').split('.');
  if(extra.length||!equal(sig,signature(payload,key)))return false;
  const {expires}=JSON.parse(Buffer.from(payload,'base64url').toString());
  return Number.isInteger(expires)&&expires>now/1000&&expires<=now/1000+SESSION_SECONDS;
 }catch{return false;}
}
const json=(status,data,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const cookieHeader=(value,age)=>`${COOKIE}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${age}`;

// Secrets come only from server environment variables. No service-role key is used.
export async function handleHostedManager(request,env=process.env,upstream=fetch){
 const {AMATOUR_MANAGER_TOKEN:token,AMATOUR_MANAGER_ACCESS_HASH:accessHash,AMATOUR_MANAGER_SESSION_SECRET:secret,AMATOUR_MANAGER_ORIGIN:origin}=env;
 if(!token||!accessHash||!secret||!origin)return json(503,{error:'El acceso administrativo remoto aún no está configurado.'});
 const url=new URL(request.url);
 if(url.origin!==origin)return json(403,{error:'Este dominio no tiene acceso administrativo habilitado.'});
 const isSession=url.pathname==='/api/manager/session';
 const value=request.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 const authenticated=validSession(value,secret);
 if(request.method==='GET'&&isSession)return json(200,{enabled:authenticated,mode:'hosted-demo'});
 if(!['POST','DELETE'].includes(request.method))return json(405,{error:'Método no permitido.'},{Allow:isSession?'GET, POST, DELETE':'POST'});
 if(request.headers.get('origin')!==origin||request.headers.get('x-amatour-manager')!=='1')return json(403,{error:'Origen de solicitud no autorizado.'});
 if(isSession&&request.method==='DELETE')return json(200,{enabled:false},{'Set-Cookie':cookieHeader('',0)});
 if(!isSession&&(!authenticated||request.method!=='POST'))return json(401,{error:'Ingresa con tu clave temporal para gestionar clubes.'});
 try{
  if(!request.headers.get('content-type')?.startsWith('application/json'))return json(415,{error:'Se requiere contenido JSON.'});
  if(Number(request.headers.get('content-length'))>65536)return json(413,{error:'Solicitud demasiado grande.'});
  const raw=await request.text();if(Buffer.byteLength(raw)>65536)return json(413,{error:'Solicitud demasiado grande.'});
  const input=JSON.parse(raw);
  if(isSession){
   if(typeof input.access_key!=='string'||input.access_key.length>256)return json(401,{error:'Clave temporal incorrecta.'});
   const hash=createHash('sha256').update(input.access_key).digest('hex');
   if(!equal(hash,accessHash))return json(401,{error:'Clave temporal incorrecta.'});
   return json(200,{enabled:true,mode:'hosted-demo'},{'Set-Cookie':cookieHeader(createSession(secret),SESSION_SECONDS)});
  }
  const result=await managerOperation(input,token,upstream);
  return json(result.status,result.data);
 }catch(error){return json(400,{error:error.name==='TimeoutError'?'La operación tardó demasiado. Intenta nuevamente.':'No se pudo procesar la solicitud.'});}
}
