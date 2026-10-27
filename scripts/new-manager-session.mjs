// Run locally by the operator. Never prints the raw server capability.
import {randomBytes,createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
const token=randomBytes(32).toString('hex');
const hash=createHash('sha256').update(token).digest('hex');
await writeFile(new URL('../.manager-local.json',import.meta.url),JSON.stringify({token}),{mode:0o600});
console.log('Sesión generada en el servidor local. Ejecuta este SQL en Supabase para habilitarla por 7 días:');
console.log(`insert into private.manager_capabilities(token_hash,expires_at) values ('${hash}',now()+interval '7 days');`);
