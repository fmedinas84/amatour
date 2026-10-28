import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const API_URL='https://prrfytdglzozamvjffxx.supabase.co/rest/v1/rpc/manager_gateway';
const KEY='sb_publishable_Q6CEgQn4XwPK_-6sV21FzA_JPnKMzPZ';
const actions=new Set(['clubs','snapshot','court.save','court.delete','hours.save','block.save','block.delete','reservation.create','reservation.cancel','rate.save','schedule.apply','schedule.copy','schedule.copy_day','override.save','override.delete','club.save','club.photo']);
const cookie=randomBytes(32).toString('hex');
export async function managerOperation(input,token,request=fetch){
  if(!actions.has(input.action))return {status:400,data:{error:'Operación no permitida.'}};
  const upstream=await request(API_URL,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({p_token:token,p_action:input.action,p_club:input.club_id||null,p_data:input.data||{}}),signal:AbortSignal.timeout(20000)});
  const result=await upstream.json();
  if(upstream.ok)return {status:200,data:result};
  const error=result.code==='23P01'?'El período se superpone con una reserva, un bloqueo o una ventana existente. Revisa el calendario y resuelve el conflicto explícitamente.':result.code==='23505'?'Ya existe un registro con ese nombre o número en el club.':result.message||'No se pudo guardar la operación.';
  return {status:result.code==='42501'?403:400,data:{error}};
}
export function trustedLocalRequest(req,port){
  const hosts=[`localhost:${port}`,`127.0.0.1:${port}`];
  return hosts.includes(req.headers.host) && (!req.headers.origin || req.headers.origin===`http://${req.headers.host}`);
}
function same(a,b){if(typeof a!=='string')return false;const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);}
export async function handleManager(req,res,port){
  const send=(status,data,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store',...headers});res.end(JSON.stringify(data));};
  if(!trustedLocalRequest(req,port)){send(403,{error:'Acceso de gestión permitido solo desde este servidor local.'});return;}
  let token=process.env.AMATOUR_MANAGER_TOKEN;
  if(!token){try{token=JSON.parse(await readFile(new URL('./.manager-local.json',import.meta.url),'utf8')).token;}catch{}}
  if(!token){send(503,{error:'Gestión protegida sin configurar. El operador debe habilitar una sesión temporal en el servidor.'});return;}
  if(req.url==='/api/manager/session'&&req.method==='GET'){
    send(200,{enabled:true,mode:'local-demo'}, {'Set-Cookie':`amatour_manager=${cookie}; HttpOnly; SameSite=Strict; Path=/api/manager; Max-Age=28800`});return;
  }
  const value=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('amatour_manager='))?.slice('amatour_manager='.length);
  if(req.method!=='POST'||req.headers['x-amatour-manager']!=='1'||!same(value,cookie)){send(403,{error:'Sesión local requerida.'});return;}
  try{
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65536)throw new Error('Solicitud demasiado grande.');}
    const input=JSON.parse(body);
    const result=await managerOperation(input,token);send(result.status,result.data);
  }catch(error){send(400,{error:error.name==='TimeoutError'?'Supabase tardó demasiado. Vuelve a intentarlo.':error.message});}
}
