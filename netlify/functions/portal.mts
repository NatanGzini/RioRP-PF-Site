import {neon} from '@neondatabase/serverless';
import {getStore} from '@netlify/blobs';
import {createHandler} from '../../server/handler.ts';

// Banco Postgres na Neon (plano grátis), fora dos créditos da Netlify.
// DATABASE_URL é a connection string do projeto Neon, definida nas variáveis de ambiente da Netlify.
const databaseUrl=process.env.DATABASE_URL;
let handler:((req:Request)=>Promise<Response>)|undefined;

export default async function portal(req:Request){
 if(!databaseUrl)return Response.json({error:'Banco de dados não configurado.'},{status:503});
 if(!handler){
  const sql=neon(databaseUrl);
  const store=getStore({name:'academia',consistency:'strong'});
  handler=createHandler({
   db:{query:(text,params=[])=>sql.query(text,params)},
   blobs:{
    stream:key=>store.get(key,{type:'stream'}),
    buffer:key=>store.get(key,{type:'arrayBuffer'}),
    set:async(key,data)=>{await store.set(key,data)},
    delete:key=>store.delete(key),
   },
   adminPassword:process.env.ADMIN_PASSWORD,
  });
 }
 return handler(req);
}

export const config={path:'/api/portal'};
