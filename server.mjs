import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import {handleManager} from './manager-server.mjs';
const port=Number(process.env.PORT || 3000);
const root = resolve('public');
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.mp4':'video/mp4', '.jpg':'image/jpeg' };
const server = createServer(async (req,res) => {
  if(req.url.startsWith('/api/manager')){await handleManager(req,res,port);return;}
  const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname === '/clubes' ? '/manager.html' : pathname));
  if (!file.startsWith(root + '\\') && !file.startsWith(root + '/')) { res.writeHead(403).end(); return; }
  try { const data=await readFile(file); res.writeHead(200,{'Content-Type':types[extname(file)] || 'application/octet-stream','X-Content-Type-Options':'nosniff'}); res.end(data); }
  catch { res.writeHead(404).end('No encontrado'); }
});
server.listen(port,'127.0.0.1',()=>console.log('Amatour listo en http://localhost:'+port));
