// Servidor local: Vite (frontend) + a mesma API da Netlify, com Postgres embutido (PGlite) e PDFs em disco.
// Os dados ficam em .local-data/ (ignorado pelo git). Não precisa de conta Netlify nem Neon.
import {createServer} from 'node:http';
import {mkdir} from 'node:fs/promises';
import {createServer as createVite} from 'vite';
import {PGlite} from '@electric-sql/pglite';
import {createHandler} from '../server/handler.ts';
import {pgliteDb,fileBlobs} from './local-deps.mjs';

await mkdir('.local-data',{recursive:true});
const port=Number(process.env.PORT||5173);
const adminPassword=process.env.ADMIN_PASSWORD||'senha-local-dev';
const handle=createHandler({db:pgliteDb(new PGlite('.local-data/pg')),blobs:await fileBlobs('.local-data/blobs'),adminPassword});
const vite=await createVite({server:{middlewareMode:true},appType:'spa'});

createServer(async(req,res)=>{
 if(!req.url?.startsWith('/api/portal'))return vite.middlewares(req,res);
 try{
  const chunks=[];for await(const c of req)chunks.push(c);
  const request=new Request(`http://${req.headers.host}${req.url}`,{method:req.method,headers:Object.entries(req.headers).filter(([,v])=>typeof v==='string'),body:['GET','HEAD'].includes(req.method??'')?undefined:Buffer.concat(chunks)});
  const response=await handle(request);
  res.writeHead(response.status,Object.fromEntries(response.headers));
  if(response.body)for await(const c of response.body)res.write(c);
  res.end();
 }catch(e){console.error(e);res.writeHead(500).end()}
}).listen(port,'127.0.0.1',()=>{
 console.log(`Portal local em http://localhost:${port}`);
 console.log(`Admin local: usuário "admin", senha definida em ADMIN_PASSWORD (padrão local: ${process.env.ADMIN_PASSWORD?'definida por você':adminPassword}).`);
});
