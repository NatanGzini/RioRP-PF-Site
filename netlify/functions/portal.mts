import {getDatabase} from '@netlify/database';
import {getStore} from '@netlify/blobs';
import {createHandler,type Db} from '../../server/handler.ts';

let handler:((req:Request)=>Promise<Response>)|undefined;

// Netlify Database: provisionado automaticamente no deploy; as tabelas vêm de netlify/database/migrations/.
function connect():Db{
 const db=getDatabase();
 return db.driver==='serverless'
  ?{query:(text,params=[])=>db.httpClient.query(text,params,{arrayMode:false,fullResults:false})}
  :{query:async(text,params=[])=>(await db.pool.query(text,params)).rows};
}

export default async function portal(req:Request){
 if(!handler){
  let db:Db;
  try{db=connect()}catch(e){console.error(e);return Response.json({error:'Banco de dados não configurado.'},{status:503})}
  const store=getStore({name:'academia',consistency:'strong'});
  handler=createHandler({
   db,
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
