// API do portal (/api/portal). Independe da Netlify: o banco e o armazenamento de PDFs são injetados,
// o que permite rodar a mesma lógica com Neon + Netlify Blobs em produção e PGlite + memória localmente.
import {SCHEMA} from './schema.ts';
import {hashPassword,verifyPassword,sha256Hex,sameSecret} from './passwords.ts';

export type Db={query(sql:string,params?:unknown[]):Promise<any[]>};
export type BlobStore={
 stream(key:string):Promise<ReadableStream|null>;
 buffer(key:string):Promise<ArrayBuffer|null>;
 set(key:string,data:ArrayBuffer):Promise<void>;
 delete(key:string):Promise<void>;
 exists(key:string):Promise<boolean>;
};
export type Deps={db:Db;blobs:BlobStore;adminPassword?:string};

// Requisições de funções Netlify são limitadas a ~6 MB, por isso PDFs sobem em partes de 3 MB.
export const CHUNK_SIZE=3*1024*1024;
const MAX_PDF=20*1024*1024,MAX_PARTS=Math.ceil(MAX_PDF/CHUNK_SIZE);
// Anexos de denúncia: guardados nas próprias partes (sem remontar, para caber no tempo da função) e entregues em sequência.
// 5 partes de 3 MB = 15 MB, abaixo do limite de resposta das funções Netlify.
const MAX_ATTACH=4,ATTACH_PARTS=5;
// Tipo real do arquivo pelos primeiros bytes; o tipo informado pelo navegador é ignorado.
function mediaType(b:Uint8Array){
 const h=(...x:number[])=>x.every((v,i)=>b[i]===v),ascii=(o:number,t:string)=>[...t].every((c,i)=>b[o+i]===c.charCodeAt(0));
 if(h(0x89,0x50,0x4e,0x47))return 'image/png';if(h(0xff,0xd8,0xff))return 'image/jpeg';if(ascii(0,'GIF8'))return 'image/gif';
 if(ascii(0,'RIFF')&&ascii(8,'WEBP'))return 'image/webp';if(h(0x1a,0x45,0xdf,0xa3))return 'video/webm';
 if(ascii(4,'ftyp'))return ascii(8,'qt  ')?'video/quicktime':'video/mp4';
 return null;
}
// Destaque da página inicial: notícia editável pelos instrutores. Este é o conteúdo usado até a primeira edição.
export const DEFAULT_HIGHLIGHT={active:true,tag:'Operação Traíra',title:'PF prende Andrex',text:'Em ação coordenada da Polícia Federal de RIO RP, a Operação Traíra cumpriu mandado de prisão contra Andrex. A investigação segue em andamento. Informações sobre o caso podem ser enviadas pelo canal de denúncia anônima.',date:'',stamp:'PRESO'};
const STUDENT_SESSION=604800000,STAFF_SESSION=43200000,LOCK_AFTER=5,LOCK_TIME=600000,LOCK_WINDOW=900000;
// Limites por conexão e por hora (anti-força bruta e anti-spam) e espera entre tentativas de prova reprovadas.
const LIMITS={login:30,staff:20,report:6,upload:45},EXAM_COOLDOWN=600000,HOUSEKEEPING_EVERY=3600000,ORPHAN_AGE=86400000;

// Só mensagens criadas com fail() chegam ao usuário; qualquer outro erro vira uma mensagem genérica (sem detalhes internos).
class UserError extends Error{}
const base={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Cookie'};
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:base});
const fail=(s:string):never=>{throw new UserError(s)};
const str=(v:unknown,min=1,max=200)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max?v.trim():fail('Preencha os campos corretamente.');
const secret=(v:unknown,min:number,message:string)=>typeof v==='string'&&v.length>=min&&v.length<=200?v:fail(message);
const normalizeName=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
const sessionKey=async(token:string)=>'session:'+await sha256Hex(token);
const cookie=(req:Request,value:string,age:number)=>`pf_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(req.url).protocol==='https:'?'; Secure':''}`;

export function createHandler({db,blobs,adminPassword}:Deps){
 // ADMIN_PASSWORD curta demais desativa o acesso administrativo em vez de aceitá-la.
 const adminConfigured=!!adminPassword&&adminPassword.length>=12;
 const adminVersion=async()=>(await sha256Hex('admin:'+adminPassword)).slice(0,16);
 const query=(sql:string,v:unknown[])=>{let i=0;return db.query(sql.replace(/\?/g,()=>'$'+(++i)),v)};
 const first=async(sql:string,...v:unknown[])=>(await query(sql,v))[0];
 const all=(sql:string,...v:unknown[])=>query(sql,v);
 const run=(sql:string,...v:unknown[])=>query(sql,v);
 // Cria as tabelas uma vez por instância; uma segunda tentativa cobre duas instâncias criando ao mesmo tempo.
 let ready:Promise<void>|undefined;
 const migrate=async()=>{for(const s of SCHEMA)await db.query(s)};
 const ensureSchema=()=>ready??=migrate().catch(()=>migrate()).catch(e=>{ready=undefined;throw e});
 // Segredo usado para embaralhar os códigos de IP: a senha do admin quando existe, senão um valor aleatório da instância.
 const pepper=adminPassword||crypto.randomUUID();
 // Hash de uma senha qualquer, usado quando o instrutor não existe: a resposta demora o mesmo e não revela quais IDs existem.
 let dummyHash:Promise<string>|undefined;
 const dummy=()=>dummyHash??=hashPassword(crypto.randomUUID());
 // Faxina periódica (no máximo 1x por hora por instância): anexos abandonados, sessões vencidas e bloqueios antigos.
 let lastHousekeeping=0;
 const housekeeping=async()=>{
  const now=Date.now();if(now-lastHousekeeping<HOUSEKEEPING_EVERY)return;lastHousekeeping=now;
  try{
   for(const r of await all("SELECT key,value FROM settings WHERE key LIKE 'pend:%' OR key LIKE 'session:%' OR key LIKE 'lock:%'")){
    let v:any;try{v=JSON.parse(r.value)}catch{v=Number(r.value)}
    if(r.key.startsWith('pend:')&&now-Number(v)>ORPHAN_AGE){const upload=r.key.slice(5);for(let i=0;i<ATTACH_PARTS;i++)await blobs.delete(`report-uploads/${upload}/${i}`);await run('DELETE FROM settings WHERE key=?',r.key)}
    else if(r.key.startsWith('session:')&&v?.expires<=now)await run('DELETE FROM settings WHERE key=?',r.key);
    else if(r.key.startsWith('lock:')&&now-(v?.last||0)>ORPHAN_AGE)await run('DELETE FROM settings WHERE key=?',r.key);
   }
  }catch(e){console.error(e)}
 };

 return async function handle(req:Request):Promise<Response>{try{
 await ensureSchema();
 const url=new URL(req.url),now=Date.now();
 const token=req.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('pf_session='))?.slice(11);
 const key=token&&/^[a-f0-9-]{72}$/.test(token)?await sessionKey(token):null;
 let me:any=null,admin=false;
 if(key){const row=await first('SELECT value FROM settings WHERE key=?',key);if(row){const session=JSON.parse(row.value);
  if(session.expires<=now)await run('DELETE FROM settings WHERE key=?',key);
  else if(session.id==='admin'){if(session.staff&&adminConfigured&&session.v===await adminVersion()){admin=true;me={id:'admin',name:'Comando da academia',role:'instrutor'}}}
  else if(session.staff){const m=await first("SELECT id,name,role,password FROM members WHERE id=? AND role='instrutor'",session.id);if(m?.password&&m.password.slice(-16)===session.v)me={id:m.id,name:m.name,role:m.role}}
  else me=await first("SELECT id,name,role FROM members WHERE id=? AND role IN ('aluno','agente')",session.id);
 }}
 const instructor=me?.role==='instrutor';
 const readHighlight=async()=>{const row=await first("SELECT value FROM settings WHERE key='highlight'");try{return row?JSON.parse(row.value):DEFAULT_HIGHLIGHT}catch{return DEFAULT_HIGHLIGHT}};
 // Limite por conexão e por hora. Guarda só um código derivado do IP, misturado a um segredo do servidor
 // (não dá para descobrir o IP a partir do banco) e trocado a cada hora; nada é ligado à denúncia.
 const ip=req.headers.get('x-nf-client-connection-ip')||req.headers.get('x-forwarded-for')?.split(',')[0].trim()||'local';
 const ipTag=async(scope:string)=>(await sha256Hex(`${scope}:${pepper}:${ip}`)).slice(0,24);
 const withinLimit=async(kind:string,max:number)=>{
  const hour=String(Math.floor(now/3600000)),k=`rl:${hour}:${kind}:${await ipTag('rl:'+hour)}`;
  const row=await first('SELECT value FROM settings WHERE key=?',k),n=row?Number(row.value):0;
  if(n>=max)return false;
  await run('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',k,String(n+1));
  if(!row)await run("DELETE FROM settings WHERE key LIKE 'rl:%' AND key < ?",`rl:${hour}:`);
  return true;
 };
 const startSession=async(session:object,age:number,message:string)=>{
  const newToken=crypto.randomUUID()+crypto.randomUUID();
  if(key)await run('DELETE FROM settings WHERE key=?',key);
  await run('INSERT INTO settings VALUES (?,?)',await sessionKey(newToken),JSON.stringify({...session,expires:now+age}));
  const response=json({message});response.headers.set('Set-Cookie',cookie(req,newToken,age/1000));return response;
 };
 if(req.method==='GET'){
  if(url.searchParams.get('action')==='pdf'){
   if(!me)return json({error:'Acesso restrito.'},403);
   const c=await first('SELECT * FROM courses WHERE id=?',url.searchParams.get('course'));
   if(!c||(!instructor&&me.role==='aluno'&&c.kind!=='biblia'))return json({error:'Sem acesso.'},403);
   const file=await blobs.stream(c.file);if(!file)return json({error:'PDF não encontrado.'},404);
   return new Response(file,{headers:{...base,'Content-Type':'application/pdf','Cache-Control':'private, no-store','Content-Disposition':'inline','X-Frame-Options':'SAMEORIGIN'}});
  }
  // Consultas exclusivas dos instrutores: ficha de um membro e questões de um material (para edição).
  if(url.searchParams.get('action')==='member'){
   if(!instructor)return json({error:'Apenas instrutores.'},403);
   const id=url.searchParams.get('id');
   const member=await first('SELECT id,name,role,created FROM members WHERE id=?',id);if(!member)return json({error:'Matrícula não encontrada.'},404);
   const reading=await all('SELECT course,SUM(done)::int AS done,SUM(seconds)::int AS seconds,MAX(last) AS last FROM reading WHERE member=? GROUP BY course',id);
   const attempts=await all('SELECT id,course,started,submitted,score,passed FROM attempts WHERE member=? ORDER BY started DESC',id);
   const events=await all('SELECT attempt,type,at FROM exam_events WHERE member=? ORDER BY at',id);
   return json({member,reading,attempts:attempts.map((a:any)=>({...a,events:events.filter((e:any)=>e.attempt===a.id).map(({type,at}:any)=>({type,at}))}))});
  }
  if(url.searchParams.get('action')==='attachment'){
   if(!instructor)return json({error:'Apenas instrutores.'},403);
   const r=await first('SELECT attachments FROM reports WHERE id=?',url.searchParams.get('report'));
   const a=r?.attachments?JSON.parse(r.attachments)[Number(url.searchParams.get('n'))]:null;
   if(!a)return json({error:'Anexo não encontrado.'},404);
   let i=0;
   const body=new ReadableStream({async pull(c){if(i>=a.parts){c.close();return}const part=await blobs.buffer(`report-uploads/${a.upload}/${i++}`);if(part)c.enqueue(new Uint8Array(part));else c.close()}});
   // sandbox: mesmo que alguém abra o anexo direto no navegador, nada nele pode rodar como parte do site.
   return new Response(body,{headers:{...base,'Content-Type':a.type,'Cache-Control':'private, max-age=3600','Content-Disposition':`inline; filename="${a.name.replace(/"/g,'')}"`,'Content-Security-Policy':"default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox"}});
  }
  if(url.searchParams.get('action')==='course'){
   if(!instructor)return json({error:'Apenas instrutores.'},403);
   const c=await first('SELECT id,title,kind,pages,pass,questions FROM courses WHERE id=?',url.searchParams.get('id'));if(!c)return json({error:'Material não encontrado.'},404);
   return json(c);
  }
  const courses=me?await all('SELECT id,title,kind,pages,pass FROM courses'+(!instructor&&me.role==='aluno'?" WHERE kind='biblia'":'')+' ORDER BY title'):[];
  const progress=me?await all('SELECT course,page,seconds,done FROM reading WHERE member=?',me.id):[];
  const exams=me?await all('SELECT id,course,started,submitted,score,passed FROM attempts WHERE member=?',me.id):[];
  // Resumo para o painel de membros: páginas lidas por material e situação das provas, com total de alertas.
  const readingSummary=instructor?await all('SELECT member,course,SUM(done)::int AS done,MAX(last) AS last FROM reading GROUP BY member,course'):[];
  const examSummary=instructor?await all('SELECT a.member,a.course,COUNT(*)::int AS attempts,MAX(a.score) AS best,MAX(a.passed) AS passed,(SELECT COUNT(*)::int FROM exam_events e WHERE e.member=a.member AND e.course=a.course) AS alerts FROM attempts a GROUP BY a.member,a.course'):[];
  return json({me,admin,configured:adminConfigured,discord:(await first("SELECT value FROM settings WHERE key='discord'"))?.value||'',highlight:await readHighlight(),courses,progress,exams,members:instructor?await all('SELECT id,name,role,created FROM members ORDER BY created DESC'):[],readingSummary,examSummary,reports:instructor?await all('SELECT * FROM reports ORDER BY created DESC LIMIT 100'):[]});
 }
 if(req.method!=='POST')return json({error:'Método não permitido.'},405);
 if(req.headers.get('origin')!==url.origin)return json({error:'Origem inválida.'},403);
 if(Number(req.headers.get('content-length')||0)>CHUNK_SIZE+1000000)return json({error:'Envio muito grande.'},413);
 let form:FormData|null=null,b:any;
 try{form=req.headers.get('content-type')?.includes('multipart/form-data')?await req.formData():null;b=form?{action:form.get('action')}:await req.json()}
 catch{return json({error:'Requisição inválida.'},400)}
 if(!b||typeof b!=='object'||Array.isArray(b)||typeof b.action!=='string')return json({error:'Requisição inválida.'},400);
 await housekeeping();
 if(b.action==='login'){
  if(!await withinLimit('login',LIMITS.login))return json({error:'Muitas tentativas de acesso. Aguarde um pouco e tente de novo.'},429);
  const id=str(b.id,1,30),name=str(b.name,2,100);
  const member=await first("SELECT id,name,role FROM members WHERE lower(id)=lower(?)",id);
  // Instrutores não entram por aqui; a mensagem explica onde entrar em vez de parecer erro de cadastro.
  if(member?.role==='instrutor'&&normalizeName(member.name)===normalizeName(name))return json({error:'Este ID é de um instrutor. Use o botão "Acesso de instrutores", logo abaixo, com o seu ID e a sua senha.'},401);
  if(!member||member.role==='instrutor'||normalizeName(member.name)!==normalizeName(name))return json({error:'ID ou nome in-game não conferem com o cadastro. Consulte seu instrutor.'},401);
  return startSession({id:member.id},STUDENT_SESSION,'Acesso realizado. Bons estudos!');
 }
 if(b.action==='staff-login'){
  const user=str(b.user,1,30),password=secret(b.password,1,'Informe usuário e senha.');
  if(!await withinLimit('staff',LIMITS.staff))return json({error:'Muitas tentativas de acesso. Aguarde um pouco e tente de novo.'},429);
  // O bloqueio vale para o par usuário + conexão: quem erra a senha bloqueia só a si mesmo, não o instrutor verdadeiro.
  const lockKey=`lock:${user.toLowerCase()}:${await ipTag('lock')}`,lockRow=await first('SELECT value FROM settings WHERE key=?',lockKey);
  const lock=lockRow?JSON.parse(lockRow.value):{n:0,until:0,last:0};
  if(lock.until>now)return json({error:`Muitas tentativas incorretas. Aguarde ${Math.ceil((lock.until-now)/60000)} minuto(s) e tente de novo.`},429);
  let session:object|null=null;
  if(user.toLowerCase()==='admin'){if(adminConfigured&&(await sameSecret(password,adminPassword!)||await sameSecret(password.trim(),adminPassword!)))session={id:'admin',staff:true,v:await adminVersion()}}
  else{
   // ID sem diferenciar maiúsculas; a senha é aceita como digitada ou sem espaços nas pontas (senhas antigas podem ter sido salvas com espaço).
   const m=await first("SELECT id,password FROM members WHERE lower(id)=lower(?) AND role='instrutor'",user);
   if(m?.password&&(await verifyPassword(password,m.password)||(password.trim()!==password&&await verifyPassword(password.trim(),m.password))))session={id:m.id,staff:true,v:m.password.slice(-16)};
   else if(!m?.password)await verifyPassword(password,await dummy());
  }
  if(!session){
   // O contador zera após um bloqueio ou depois de 15 minutos sem erros, para não acumular tentativas de dias diferentes.
   const n=(lock.until||now-(lock.last||0)>LOCK_WINDOW?0:lock.n)+1;
   await run('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',lockKey,JSON.stringify({n,until:n>=LOCK_AFTER?now+LOCK_TIME:0,last:now}));
   const left=LOCK_AFTER-n;
   return json({error:left>0?`Usuário ou senha incorretos. Restam ${left} tentativa(s) antes de um bloqueio de 10 minutos.`:'Usuário ou senha incorretos. Acesso bloqueado por 10 minutos.'},401);
  }
  if(lockRow)await run('DELETE FROM settings WHERE key=?',lockKey);
  return startSession(session,STAFF_SESSION,'Acesso de instrutor liberado.');
 }
 if(b.action==='logout'){
  if(key)await run('DELETE FROM settings WHERE key=?',key);
  const response=json({message:'Você saiu da academia.'});response.headers.set('Set-Cookie',cookie(req,'',0));return response;
 }
 if(b.action==='report-upload'){
  if(!await withinLimit('upload',LIMITS.upload))return json({error:'Muitos envios em pouco tempo. Aguarde alguns minutos e tente de novo.'},429);
  const upload=String(form?.get('upload')),index=Number(form?.get('index')),chunk=form?.get('chunk');
  if(!/^[a-f0-9-]{36}$/.test(upload)||!Number.isInteger(index)||index<0||index>=ATTACH_PARTS||!(chunk instanceof Blob)||!chunk.size||chunk.size>CHUNK_SIZE)fail('Parte do anexo inválida. Cada arquivo pode ter até 15 MB.');
  if(await first('SELECT key FROM settings WHERE key=?','upl:'+upload))fail('Este anexo já foi enviado.');
  const data=await (chunk as Blob).arrayBuffer();
  if(index===0&&!mediaType(new Uint8Array(data.slice(0,16))))fail('Formato não aceito. Envie imagens (PNG, JPG, GIF, WebP) ou vídeos (MP4, WebM, MOV).');
  // Partes só em ordem a partir da 0, que registra o envio como pendente; pendentes sem denúncia são apagados em 24 h.
  if(index===0)await run("INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO NOTHING",'pend:'+upload,String(now));
  else if(!await first('SELECT key FROM settings WHERE key=?','pend:'+upload))fail('Envie o arquivo desde o começo.');
  await blobs.set(`report-uploads/${upload}/${index}`,data);
  return json({ok:true});
 }
 if(b.action==='report'){
  if(!await withinLimit('report',LIMITS.report))return json({error:'Muitas denúncias em pouco tempo. Aguarde e tente de novo mais tarde.'},429);
  const organization=str(b.organization,2,120),location=str(b.location,2,200),details=str(b.details,30,5000);
  const list=b.attachments===undefined?[]:b.attachments;
  if(!Array.isArray(list)||list.length>MAX_ATTACH)fail('Envie no máximo 4 arquivos.');
  const attachments:any[]=[];
  for(const a of list){
   const upload=String(a?.upload),parts=Number(a?.parts);
   if(!/^[a-f0-9-]{36}$/.test(upload)||!Number.isInteger(parts)||parts<1||parts>ATTACH_PARTS||attachments.some(x=>x.upload===upload))fail('Anexo inválido.');
   if(await first('SELECT key FROM settings WHERE key=?','upl:'+upload))fail('Este anexo já foi enviado.');
   for(let i=1;i<parts;i++)if(!await blobs.exists(`report-uploads/${upload}/${i}`))fail('O envio de um anexo ficou incompleto. Tente novamente.');
   const head=await blobs.buffer(`report-uploads/${upload}/0`);if(!head)fail('O envio de um anexo ficou incompleto. Tente novamente.');
   const type=mediaType(new Uint8Array(head!.slice(0,16)));if(!type)fail('Formato não aceito.');
   attachments.push({upload,parts,type,name:String(a?.name||'arquivo').replace(/[^\p{L}\p{N} ._()-]/gu,'').slice(0,80)||'arquivo'});
  }
  const id=crypto.randomUUID();
  await run('INSERT INTO reports (id,organization,location,details,created,attachments) VALUES (?,?,?,?,?,?)',id,organization,location,details,now,JSON.stringify(attachments));
  for(const a of attachments){await run('INSERT INTO settings VALUES (?,?)','upl:'+a.upload,id);await run('DELETE FROM settings WHERE key=?','pend:'+a.upload)}
  return json({message:'Denúncia recebida. Protocolo: '+id.slice(0,8).toUpperCase()});
 }
 if(!me)return json({error:'Entre com seu ID e nome in-game para continuar.'},401);
 if(b.action==='exam-event'){
  // Só vale para a tentativa aberta do próprio aluno, dentro do prazo; limite por tentativa evita encher o banco.
  const type=String(b.type);if(!['copy','cut','paste','hidden','blur'].includes(type))fail('Evento inválido.');
  const a=await first('SELECT id,course,started,submitted FROM attempts WHERE id=? AND member=?',str(b.attempt,1,60),me.id);
  if(!a||a.submitted||now-a.started>900000)return json({ok:false});
  if((await first('SELECT COUNT(*)::int AS n FROM exam_events WHERE attempt=?',a.id)).n>=300)return json({ok:false});
  await run('INSERT INTO exam_events VALUES (?,?,?,?,?,?)',crypto.randomUUID(),a.id,me.id,a.course,type,now);
  return json({ok:true});
 }
 if(['member','role','upload','course','settings','course-edit','course-delete','member-remove','report-delete','highlight'].includes(b.action)){
  if(!instructor)return json({error:'Apenas instrutores podem realizar esta ação.'},403);
  if(b.action==='report-delete'){
   const r=await first('SELECT id,attachments FROM reports WHERE id=?',str(b.report,1,60));if(!r)fail('Denúncia não encontrada.');
   for(const at of r.attachments?JSON.parse(r.attachments):[]){for(let i=0;i<at.parts;i++)await blobs.delete(`report-uploads/${at.upload}/${i}`);await run('DELETE FROM settings WHERE key=?','upl:'+at.upload)}
   await run('DELETE FROM reports WHERE id=?',r.id);
   return json({message:'Denúncia apagada, com os anexos.'});
  }
  if(b.action==='member'){
   const id=str(b.id,1,30);if(id.toLowerCase()==='admin')fail('Este ID é reservado.');
   if(await first('SELECT id FROM members WHERE lower(id)=lower(?)',id))fail('Este ID já está cadastrado.');
   await run("INSERT INTO members (id,name,role,created) VALUES (?,?,'aluno',?)",id,str(b.name,2,100),now);
   return json({message:'Aluno cadastrado. Ele já pode entrar com o ID e o nome in-game informados.'});
  }
  if(b.action==='role'){
   if(!['aluno','agente','instrutor'].includes(b.role))fail('Perfil inválido.');
   if(b.role==='instrutor'&&!admin)fail('Somente o administrador pode nomear instrutores.');
   const id=str(b.id,1,30),target=await first('SELECT role FROM members WHERE id=?',id);
   if(!target)fail('Matrícula não encontrada.');
   if(target.role==='instrutor'&&!admin)fail('Somente o administrador altera instrutores.');
   const password=b.role==='instrutor'?await hashPassword(secret(typeof b.password==='string'?b.password.trim():b.password,8,'Defina uma senha com pelo menos 8 caracteres para o instrutor.')):null;
   await run('UPDATE members SET role=?,password=? WHERE id=?',b.role,password,id);
   return json({message:b.role==='instrutor'?'Instrutor definido. Ele entra com o ID '+id+' e a senha informada.':'Perfil atualizado.'});
  }
  if(b.action==='member-remove'){
   const id=str(b.id,1,30),target=await first('SELECT id,name,role FROM members WHERE id=?',id);
   if(!target)fail('Matrícula não encontrada.');
   if(id===me.id)fail('Você não pode remover a própria matrícula.');
   if(target.role==='instrutor'&&!admin)fail('Somente o administrador remove instrutores.');
   // Apaga histórico e sessões abertas: um ID recadastrado depois começa do zero e não herda o login antigo.
   for(const sql of ['DELETE FROM exam_events WHERE member=?','DELETE FROM attempts WHERE member=?','DELETE FROM reading WHERE member=?','DELETE FROM members WHERE id=?'])await run(sql,id);
   await run('DELETE FROM settings WHERE key=?','active:'+id);
   for(const s of await all("SELECT key,value FROM settings WHERE key LIKE 'session:%'")){let owner;try{owner=JSON.parse(s.value).id}catch{}if(owner===id)await run('DELETE FROM settings WHERE key=?',s.key)}
   return json({message:`Matrícula de ${target.name} (ID ${id}) removida, com todo o histórico de leitura e provas.`});
  }
  if(b.action==='highlight'){
   const opt=(v:unknown,max:number)=>typeof v==='string'&&v.length<=max?v.trim():fail('Revise os campos do destaque.');
   const value={active:!!b.active,tag:opt(b.tag,40),title:str(b.title,3,80),text:opt(b.text,400),date:opt(b.date,40),stamp:opt(b.stamp,14)};
   await run("INSERT INTO settings VALUES ('highlight',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",JSON.stringify(value));
   return json({message:value.active?'Destaque atualizado na página inicial.':'Destaque salvo e escondido da página inicial.'});
  }
  if(b.action==='settings'){
   let discord:URL;try{discord=new URL(str(b.discord))}catch{fail('Informe um convite HTTPS do Discord.')}discord=discord!;if(discord.protocol!=='https:'||!['discord.gg','discord.com'].includes(discord.hostname))fail('Informe um convite HTTPS do Discord.');
   await run("INSERT INTO settings VALUES ('discord',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",discord.href);return json({message:'Discord atualizado.'});
  }
  if(b.action==='upload'){
   const upload=String(form?.get('upload')),index=Number(form?.get('index')),chunk=form?.get('chunk');
   if(!/^[a-f0-9-]{36}$/.test(upload)||!Number.isInteger(index)||index<0||index>=MAX_PARTS||!(chunk instanceof Blob)||!chunk.size||chunk.size>CHUNK_SIZE)fail('Parte do arquivo inválida.');
   const data=await (chunk as Blob).arrayBuffer();
   if(index===0&&new TextDecoder().decode(data.slice(0,5))!=='%PDF-')fail('Arquivo PDF inválido.');
   await blobs.set(`uploads/${upload}/${index}`,data);
   return json({ok:true});
  }
  if(b.action==='course-delete'){
   const c=await first('SELECT id,title,file FROM courses WHERE id=?',str(b.course));if(!c)fail('Material não encontrado.');
   for(const sql of ['DELETE FROM exam_events WHERE course=?','DELETE FROM attempts WHERE course=?','DELETE FROM reading WHERE course=?','DELETE FROM courses WHERE id=?'])await run(sql,c.id);
   await blobs.delete(c.file);
   return json({message:`Material "${c.title}" apagado, com o progresso de leitura e as provas dele.`});
  }
  // 'course' publica um material novo; 'course-edit' altera um existente (o PDF só é trocado se um novo for enviado).
  const editing=b.action==='course-edit'?await first('SELECT * FROM courses WHERE id=?',str(b.course)):null;
  if(b.action==='course-edit'&&!editing)fail('Material não encontrado.');
  const title=str(b.title,3,120),kind=editing?editing.kind:b.kind,pages=Number(b.pages),pass=Number(b.pass);
  // biblia: formação inicial (alunos) · curso: agentes, com prova online · leitura: apostila de agentes sem prova (avaliação in game)
  if(!['biblia','curso','leitura'].includes(String(kind))||!Number.isInteger(pages)||pages<1||pages>500||!Number.isInteger(pass)||pass<1||pass>100)fail('Revise tipo, páginas e nota mínima.');
  if(!editing&&kind==='biblia'&&await first("SELECT id FROM courses WHERE kind='biblia'"))fail('A Bíblia Geral já está cadastrada.');
  let questions:any;try{questions=kind==='curso'?JSON.parse(String(b.questions||'[]')):[]}catch{fail('O JSON das questões é inválido.')}
  if(!Array.isArray(questions)||questions.length>50||(kind==='curso'&&!questions.length))fail('Cadastre entre 1 e 50 questões para o curso.');
  for(const q of questions)if(typeof q?.text!=='string'||q.text.length<5||q.text.length>500||!Array.isArray(q.options)||q.options.length!==4||q.options.some((o:any)=>typeof o!=='string'||!o.trim()||o.length>200)||!Number.isInteger(q.answer)||q.answer<0||q.answer>3)fail('Cada questão precisa de texto (até 500 caracteres), quatro opções (até 200 cada) e resposta entre 0 e 3.');
  const hasUpload=b.upload!==undefined&&b.upload!==null&&b.upload!=='';
  if(!editing&&!hasUpload)fail('Selecione um PDF de até 20 MB.');
  const id=editing?editing.id:crypto.randomUUID(),file=editing?editing.file:'courses/'+id+'.pdf';
  if(hasUpload){
   const parts=Number(b.parts),upload=String(b.upload);
   if(!/^[a-f0-9-]{36}$/.test(upload)||!Number.isInteger(parts)||parts<1||parts>MAX_PARTS)fail('Selecione um PDF de até 20 MB.');
   const chunks:ArrayBuffer[]=[];
   for(let i=0;i<parts;i++){const part=await blobs.buffer(`uploads/${upload}/${i}`);if(!part)fail('O envio do PDF ficou incompleto. Tente novamente.');chunks.push(part!)}
   const size=chunks.reduce((s,c)=>s+c.byteLength,0);if(size<5||size>MAX_PDF)fail('Selecione um PDF de até 20 MB.');
   const pdf=new Uint8Array(size);let offset=0;for(const c of chunks){pdf.set(new Uint8Array(c),offset);offset+=c.byteLength}
   if(new TextDecoder().decode(pdf.slice(0,5))!=='%PDF-')fail('Arquivo PDF inválido.');
   await blobs.set(file,pdf.buffer);
   for(let i=0;i<parts;i++)await blobs.delete(`uploads/${upload}/${i}`);
  }
  if(editing){
   await run('UPDATE courses SET title=?,pages=?,questions=?,pass=? WHERE id=?',title,pages,JSON.stringify(questions),pass,id);
   // Páginas que deixaram de existir saem do progresso, para a leitura não passar de 100%.
   if(pages<editing.pages)await run('DELETE FROM reading WHERE course=? AND page>?',id,pages);
   return json({message:'Material atualizado.'});
  }
  await run('INSERT INTO courses VALUES (?,?,?,?,?,?,?)',id,title,kind,pages,file,JSON.stringify(questions),pass);
  return json({message:'Material publicado na academia.'});
 }
 const c=await first('SELECT * FROM courses WHERE id=?',str(b.course));
 if(!c||(!instructor&&me.role==='aluno'&&c.kind!=='biblia'))return json({error:'Curso indisponível para seu perfil.'},403);
 if(['begin','pulse'].includes(b.action)){
  const page=Number(b.page);if(!Number.isInteger(page)||page<1||page>c.pages)fail('Página inválida.');
  const id=me.id+':'+c.id+':'+page,active='active:'+me.id;
  if(b.action==='begin'){
   await run('INSERT INTO reading VALUES (?,?,?,?,?,?,0,0) ON CONFLICT(id) DO UPDATE SET last=excluded.last',id,me.id,c.id,page,now,now);
   await run('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',active,id);
  }else{
   if((await first('SELECT value FROM settings WHERE key=?',active))?.value!==id)fail('A leitura está aberta em outra página. Reabra esta página.');
   await run('UPDATE reading SET seconds=LEAST(30,seconds+CASE WHEN ?-last BETWEEN 4000 AND 10000 THEN FLOOR((?-last)/1000)::int ELSE 0 END), last=? WHERE id=?',now,now,now,id);
   await run('UPDATE reading SET done=1 WHERE id=? AND seconds>=30',id);
  }
  return json(await first('SELECT seconds,done FROM reading WHERE id=?',id));
 }
 const read=await first('SELECT COUNT(*)::int AS n FROM reading WHERE member=? AND course=? AND done=1',me.id,c.id);
 if(read.n<c.pages)fail('Conclua 100% da leitura antes de continuar.');
 if(b.action==='exam'){
  if(c.kind!=='curso')fail(c.kind==='biblia'?'A Bíblia Geral não possui prova teórica.':'Esta apostila não possui prova online: a avaliação é feita in game pelos instrutores.');
  let attempt=await first('SELECT * FROM attempts WHERE member=? AND course=? ORDER BY started DESC LIMIT 1',me.id,c.id);
  if(attempt?.passed)fail('Você já foi aprovado neste curso.');
  // Espera entre tentativas reprovadas: impede descobrir o gabarito repetindo a prova sem parar.
  if(attempt?.submitted&&now-attempt.submitted<EXAM_COOLDOWN)fail(`Aguarde ${Math.ceil((EXAM_COOLDOWN-(now-attempt.submitted))/60000)} minuto(s) para tentar a prova de novo. Aproveite para revisar a apostila.`);
  if(!attempt||attempt.submitted||now-attempt.started>=900000){
   if(attempt&&!attempt.submitted)await run('UPDATE attempts SET submitted=?,score=0 WHERE id=?',now,attempt.id);
   attempt={id:crypto.randomUUID(),started:now};
   await run('INSERT INTO attempts (id,member,course,started,passed) VALUES (?,?,?,?,0)',attempt.id,me.id,c.id,now);
  }
  return json({id:attempt.id,deadline:attempt.started+900000,questions:JSON.parse(c.questions).map((q:any)=>({text:q.text,options:q.options}))});
 }
 if(b.action==='submit'){
  const a=await first('SELECT * FROM attempts WHERE id=? AND member=? AND course=?',str(b.attempt),me.id,c.id);
  if(!a||a.submitted)fail('Tentativa indisponível ou já enviada.');
  const qs=JSON.parse(c.questions),late=now-a.started>900000;
  const score=late?0:Math.round(qs.filter((q:any,i:number)=>Array.isArray(b.answers)&&q.answer===b.answers[i]).length/qs.length*100);
  const passed=score>=c.pass;
  const updated=await run('UPDATE attempts SET submitted=?,score=?,passed=? WHERE id=? AND submitted IS NULL RETURNING id',now,score,passed?1:0,a.id);
  if(!updated.length)fail('Esta tentativa já foi finalizada.');
  return json({message:late?'Tempo esgotado. Prova encerrada.':passed?'Aprovado! Seu certificado está disponível.':'Nota '+score+'%. Revise a apostila e tente novamente.',score,passed});
 }
 return json({error:'Ação inválida.'},400);
 }catch(e){
  if(e instanceof UserError)return json({error:e.message},400);
  if((e as any)?.code==='23505')return json({error:'Este ID já está cadastrado.'},400);
  console.error(e);
  return json({error:'Não foi possível concluir agora. Tente novamente.'},500);
 }};
}
