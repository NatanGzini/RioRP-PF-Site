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
};
export type Deps={db:Db;blobs:BlobStore;adminPassword?:string};

// Requisições de funções Netlify são limitadas a ~6 MB, por isso PDFs sobem em partes de 3 MB.
export const CHUNK_SIZE=3*1024*1024;
const MAX_PDF=20*1024*1024,MAX_PARTS=Math.ceil(MAX_PDF/CHUNK_SIZE);
const STUDENT_SESSION=604800000,STAFF_SESSION=43200000,LOCK_AFTER=5,LOCK_TIME=600000;

const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const fail=(s:string):never=>{throw new Error(s)};
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
   return new Response(file,{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','Content-Disposition':'inline'}});
  }
  const courses=me?await all('SELECT id,title,kind,pages,pass FROM courses'+(!instructor&&me.role==='aluno'?" WHERE kind='biblia'":'')+' ORDER BY title'):[];
  const progress=me?await all('SELECT course,page,seconds,done FROM reading WHERE member=?',me.id):[];
  const exams=me?await all('SELECT id,course,started,submitted,score,passed FROM attempts WHERE member=?',me.id):[];
  return json({me,admin,configured:adminConfigured,discord:(await first("SELECT value FROM settings WHERE key='discord'"))?.value||'',courses,progress,exams,members:instructor?await all('SELECT id,name,role FROM members ORDER BY created DESC'):[],reports:instructor?await all('SELECT * FROM reports ORDER BY created DESC LIMIT 100'):[]});
 }
 if(req.method!=='POST')return json({error:'Método não permitido.'},405);
 if(req.headers.get('origin')!==url.origin)return json({error:'Origem inválida.'},403);
 if(Number(req.headers.get('content-length')||0)>CHUNK_SIZE+1000000)return json({error:'Envio muito grande.'},413);
 const form=req.headers.get('content-type')?.includes('multipart/form-data')?await req.formData():null;
 const b=form?{action:form.get('action')}:await req.json() as any;
 if(b.action==='login'){
  const id=str(b.id,1,30),name=str(b.name,2,100);
  const member=await first("SELECT id,name FROM members WHERE id=? AND role IN ('aluno','agente')",id);
  if(!member||normalizeName(member.name)!==normalizeName(name))return json({error:'ID ou nome in-game não conferem com o cadastro. Consulte seu instrutor.'},401);
  return startSession({id:member.id},STUDENT_SESSION,'Acesso realizado. Bons estudos!');
 }
 if(b.action==='staff-login'){
  const user=str(b.user,1,30),password=secret(b.password,1,'Informe usuário e senha.');
  const lockKey='lock:'+user.toLowerCase(),lockRow=await first('SELECT value FROM settings WHERE key=?',lockKey);
  const lock=lockRow?JSON.parse(lockRow.value):{n:0,until:0};
  if(lock.until>now)return json({error:'Muitas tentativas incorretas. Aguarde alguns minutos.'},429);
  let session:object|null=null;
  if(user.toLowerCase()==='admin'){if(adminConfigured&&await sameSecret(password,adminPassword!))session={id:'admin',staff:true,v:await adminVersion()}}
  else{const m=await first("SELECT id,password FROM members WHERE id=? AND role='instrutor'",user);if(m?.password&&await verifyPassword(password,m.password))session={id:m.id,staff:true,v:m.password.slice(-16)}}
  if(!session){
   const n=(lock.until?0:lock.n)+1;
   await run('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',lockKey,JSON.stringify({n,until:n>=LOCK_AFTER?now+LOCK_TIME:0}));
   return json({error:'Usuário ou senha incorretos.'},401);
  }
  if(lockRow)await run('DELETE FROM settings WHERE key=?',lockKey);
  return startSession(session,STAFF_SESSION,'Acesso de instrutor liberado.');
 }
 if(b.action==='logout'){
  if(key)await run('DELETE FROM settings WHERE key=?',key);
  const response=json({message:'Você saiu da academia.'});response.headers.set('Set-Cookie',cookie(req,'',0));return response;
 }
 if(b.action==='report'){
  const id=crypto.randomUUID();await run('INSERT INTO reports VALUES (?,?,?,?,?)',id,str(b.organization,2,120),str(b.location,2,200),str(b.details,30,5000),now);
  return json({message:'Denúncia recebida. Protocolo: '+id.slice(0,8).toUpperCase()});
 }
 if(!me)return json({error:'Entre com seu ID e nome in-game para continuar.'},401);
 if(['member','role','upload','course','settings'].includes(b.action)){
  if(!instructor)return json({error:'Apenas instrutores podem realizar esta ação.'},403);
  if(b.action==='member'){
   const id=str(b.id,1,30);if(id.toLowerCase()==='admin')fail('Este ID é reservado.');
   await run("INSERT INTO members (id,name,role,created) VALUES (?,?,'aluno',?)",id,str(b.name,2,100),now);
   return json({message:'Aluno cadastrado. Ele já pode entrar com o ID e o nome in-game informados.'});
  }
  if(b.action==='role'){
   if(!['aluno','agente','instrutor'].includes(b.role))fail('Perfil inválido.');
   if(b.role==='instrutor'&&!admin)fail('Somente o administrador pode nomear instrutores.');
   const id=str(b.id,1,30),target=await first('SELECT role FROM members WHERE id=?',id);
   if(!target)fail('Matrícula não encontrada.');
   if(target.role==='instrutor'&&!admin)fail('Somente o administrador altera instrutores.');
   const password=b.role==='instrutor'?await hashPassword(secret(b.password,8,'Defina uma senha com pelo menos 8 caracteres para o instrutor.')):null;
   await run('UPDATE members SET role=?,password=? WHERE id=?',b.role,password,id);
   return json({message:b.role==='instrutor'?'Instrutor definido. Ele entra com o ID '+id+' e a senha informada.':'Perfil atualizado.'});
  }
  if(b.action==='settings'){
   const discord=new URL(str(b.discord));if(discord.protocol!=='https:'||!['discord.gg','discord.com'].includes(discord.hostname))fail('Informe um convite HTTPS do Discord.');
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
  // action 'course': junta as partes enviadas e publica o material.
  const title=str(b.title,3,120),kind=b.kind,pages=Number(b.pages),pass=Number(b.pass),parts=Number(b.parts),upload=String(b.upload);
  // biblia: formação inicial (alunos) · curso: agentes, com prova online · leitura: apostila de agentes sem prova (avaliação in game)
  if(!['biblia','curso','leitura'].includes(String(kind))||!Number.isInteger(pages)||pages<1||pages>500||!Number.isInteger(pass)||pass<1||pass>100)fail('Revise tipo, páginas e nota mínima.');
  if(!/^[a-f0-9-]{36}$/.test(upload)||!Number.isInteger(parts)||parts<1||parts>MAX_PARTS)fail('Selecione um PDF de até 20 MB.');
  if(kind==='biblia'&&await first("SELECT id FROM courses WHERE kind='biblia'"))fail('A Bíblia Geral já está cadastrada.');
  let questions:any;try{questions=kind==='curso'?JSON.parse(String(b.questions||'[]')):[]}catch{fail('O JSON das questões é inválido.')}
  if(!Array.isArray(questions)||questions.length>50||(kind==='curso'&&!questions.length))fail('Cadastre entre 1 e 50 questões para o curso.');
  for(const q of questions)if(typeof q?.text!=='string'||q.text.length<5||!Array.isArray(q.options)||q.options.length!==4||q.options.some((o:any)=>typeof o!=='string'||!o.trim())||!Number.isInteger(q.answer)||q.answer<0||q.answer>3)fail('Cada questão precisa de texto, quatro opções e resposta entre 0 e 3.');
  const chunks:ArrayBuffer[]=[];
  for(let i=0;i<parts;i++){const part=await blobs.buffer(`uploads/${upload}/${i}`);if(!part)fail('O envio do PDF ficou incompleto. Tente novamente.');chunks.push(part!)}
  const size=chunks.reduce((s,c)=>s+c.byteLength,0);if(size<5||size>MAX_PDF)fail('Selecione um PDF de até 20 MB.');
  const pdf=new Uint8Array(size);let offset=0;for(const c of chunks){pdf.set(new Uint8Array(c),offset);offset+=c.byteLength}
  if(new TextDecoder().decode(pdf.slice(0,5))!=='%PDF-')fail('Arquivo PDF inválido.');
  const id=crypto.randomUUID(),file='courses/'+id+'.pdf';
  await blobs.set(file,pdf.buffer);
  for(let i=0;i<parts;i++)await blobs.delete(`uploads/${upload}/${i}`);
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
  const code=(e as any)?.code;
  if(code&&code!=='23505')console.error(e);
  return json({error:code==='23505'?'Este ID já está cadastrado.':code?'Não foi possível salvar. Tente novamente.':e instanceof Error?e.message:'Falha inesperada.'},code&&code!=='23505'?500:400);
 }};
}
