// Substitutos locais do Neon e do Netlify Blobs, usados por `npm run dev` e `npm test`.
import {mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';

export const pgliteDb=pg=>({query:async(text,params=[])=>(await pg.query(text,params)).rows});

// Aplica netlify/database/migrations/*.sql em ordem, como a Netlify faz no deploy (os arquivos usam IF NOT EXISTS).
export async function applyMigrations(pg){
 const dir=new URL('../netlify/database/migrations/',import.meta.url);
 for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await pg.exec(await readFile(new URL(file,dir),'utf8'));
 return pg;
}

export function memoryBlobs(){
 const files=new Map();
 return {
  stream:async key=>files.has(key)?new Blob([files.get(key)]).stream():null,
  buffer:async key=>files.get(key)?.slice(0)??null,
  set:async(key,data)=>{files.set(key,data.slice(0))},
  delete:async key=>{files.delete(key)},
 };
}

export async function fileBlobs(dir){
 await mkdir(dir,{recursive:true});
 const path=key=>join(dir,encodeURIComponent(key));
 const read=async key=>{try{const b=await readFile(path(key));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}catch{return null}};
 return {
  stream:async key=>{const b=await read(key);return b?new Blob([b]).stream():null},
  buffer:read,
  set:async(key,data)=>{await writeFile(path(key),new Uint8Array(data))},
  delete:async key=>{await rm(path(key),{force:true})},
 };
}
