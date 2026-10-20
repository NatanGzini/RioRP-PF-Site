// Substitutos locais do Neon e do Netlify Blobs, usados por `npm run dev` e `npm test`.
import {mkdir,readFile,writeFile,rm,stat} from 'node:fs/promises';
import {join} from 'node:path';

export const pgliteDb=pg=>({query:async(text,params=[])=>(await pg.query(text,params)).rows});

export function memoryBlobs(){
 const files=new Map();
 return {
  stream:async key=>files.has(key)?new Blob([files.get(key)]).stream():null,
  buffer:async key=>files.get(key)?.slice(0)??null,
  set:async(key,data)=>{files.set(key,data.slice(0))},
  delete:async key=>{files.delete(key)},
  exists:async key=>files.has(key),
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
  exists:async key=>{try{await stat(path(key));return true}catch{return false}},
 };
}
