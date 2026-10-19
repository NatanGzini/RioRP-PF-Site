import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
export const dynamic='force-dynamic';
const json=(v:unknown,status=200)=>Response.json(v,{status,headers:{'Cache-Control':'no-store'}});
const fail=(s:string)=>{throw new Error(s)};
const str=(v:unknown,min=1,max=200)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max?v.trim():fail('Preencha os campos corretamente.');
const normalizeName=(s:string)=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('pt-BR');
const sessionKey=async(token:string)=>'session:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(n=>n.toString(16).padStart(2,'0')).join('');
const cookie=(req:Request,value:string,age:number)=>`pf_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(req.url).protocol==='https:'?'; Secure':''}`;
export async function GET(req:Request){return handle(req)}
export async function POST(req:Request){return handle(req)}
async function handle(req:Request){try{
 const db=env.DB!; if(!db)return json({error:'Banco de dados indisponível.'},503);
 const first=async(sql:string,...v:any[])=>db.prepare(sql).bind(...v).first<any>();
 const all=async(sql:string,...v:any[])=>(await db.prepare(sql).bind(...v).all<any>()).results;
 const run=async(sql:string,...v:any[])=>db.prepare(sql).bind(...v).run();
 const user=await getChatGPTUser();
 const adminEmail=(env as unknown as Record<string,string>).ADMIN_EMAIL;
 const admin=!!user&&!!adminEmail&&user.email.toLowerCase()===adminEmail.toLowerCase();
 let me=user?await first("SELECT id,name,role FROM members WHERE user_id=? AND role='instrutor'",user.userId):null;
 if(user&&!me){const mapping=await first('SELECT value FROM settings WHERE key=?','instructor-email:'+user.email.toLowerCase());if(mapping)me=await first("SELECT id,name,role FROM members WHERE id=? AND role='instrutor'",mapping.value);}
 const token=req.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('pf_session='))?.slice(11);
 const key=token&&/^[a-f0-9-]{72}$/.test(token)?await sessionKey(token):null;
 if(!me&&key){const row=await first('SELECT value FROM settings WHERE key=?',key);if(row){const session=JSON.parse(row.value);if(session.expires>Date.now())me=await first("SELECT id,name,role FROM members WHERE id=? AND role IN ('aluno','agente')",session.id);else await run('DELETE FROM settings WHERE key=?',key);}}
 if(admin)me={id:'admin',name:'Comando da academia',role:'instrutor'};
 const instructor=me?.role==='instrutor'; const now=Date.now();
 if(req.method==='GET'){
  const action=new URL(req.url).searchParams.get('action');
  if(action==='pdf'){
   if(!me)return json({error:'Acesso restrito.'},403);
   const c=await first('SELECT * FROM courses WHERE id=?',new URL(req.url).searchParams.get('course'));
   if(!c||(!instructor&&me.role==='aluno'&&c.kind!=='biblia'))return json({error:'Sem acesso.'},403);
   const file=await env.BUCKET!.get(c.file); if(!file)return json({error:'PDF não encontrado.'},404);
   return new Response(file.body,{headers:{'Content-Type':'application/pdf','Cache-Control':'private, no-store','Content-Disposition':'inline'}});
  }
  const courses=me?await all('SELECT id,title,kind,pages,pass FROM courses'+(!instructor&&me.role==='aluno'?" WHERE kind='biblia'":"")):[];
  const progress=me?await all('SELECT course,page,seconds,done FROM reading WHERE member=?',me.id):[];
  const exams=me?await all('SELECT id,course,started,submitted,score,passed FROM attempts WHERE member=?',me.id):[];
  return json({signedIn:!!user,me,admin,configured:!!adminEmail,discord:(await first("SELECT value FROM settings WHERE key='discord'"))?.value||'',courses,progress,exams,members:instructor?await all('SELECT id,name,role,user_id FROM members ORDER BY created DESC'):[],reports:instructor?await all('SELECT * FROM reports ORDER BY created DESC LIMIT 100'):[]});
 }
 if(req.headers.get('origin')!==new URL(req.url).origin)return json({error:'Origem inválida.'},403);
 if(Number(req.headers.get('content-length')||0)>22000000)return json({error:'Arquivo muito grande.'},413);
 const form=req.headers.get('content-type')?.includes('multipart/form-data')?await req.formData():null;
 const b=form?{action:'course'}:await req.json() as any;
 if(b.action==='login'){
  const id=str(b.id,1,30),name=str(b.name,2,100);
  const member=await first("SELECT id,name FROM members WHERE id=? AND role IN ('aluno','agente')",id);
  if(!member||normalizeName(member.name)!==normalizeName(name))return json({error:'ID ou nome in-game não conferem com o cadastro. Consulte seu instrutor.'},401);
  const newToken=crypto.randomUUID()+crypto.randomUUID();
  if(key)await run('DELETE FROM settings WHERE key=?',key);
  await run('INSERT INTO settings VALUES (?,?)',await sessionKey(newToken),JSON.stringify({id:member.id,expires:now+604800000}));
  const response=json({message:'Acesso realizado. Bons estudos!'});response.headers.set('Set-Cookie',cookie(req,newToken,604800));return response;
 }
 if(b.action==='logout'){
  if(key)await run('DELETE FROM settings WHERE key=?',key);
  const response=json({message:'Você saiu da academia.'});response.headers.set('Set-Cookie',cookie(req,'',0));return response;
 }
 if(b.action==='report'){
  const id=crypto.randomUUID(); await run('INSERT INTO reports VALUES (?,?,?,?,?)',id,str(b.organization,2,120),str(b.location,2,200),str(b.details,30,5000),now);
  return json({message:'Denúncia recebida. Protocolo: '+id.slice(0,8).toUpperCase()});
 }
 if(!user&&!me)return json({error:'Entre com seu ID e nome in-game para continuar.'},401);
 if(!me)return json({error:'Sua matrícula precisa ser cadastrada por um instrutor.'},403);
 if(['member','role','course','settings'].includes(b.action)){
  if(!instructor)return json({error:'Apenas instrutores podem realizar esta ação.'},403);
  if(b.action==='member'){
   await run("INSERT INTO members (id,name,role,created) VALUES (?,?,'aluno',?)",str(b.id,1,30),str(b.name,2,100),now);
   return json({message:'Aluno cadastrado. Ele já pode entrar com o ID e o nome in-game informados.'});
  }
  if(b.action==='role'){
   if(!['aluno','agente','instrutor'].includes(b.role))fail('Perfil inválido.');
   if(b.role==='instrutor'&&!admin)fail('Somente o administrador pode nomear instrutores.');
   const target=await first('SELECT role FROM members WHERE id=?',str(b.id));
   if(target?.role==='instrutor'&&!admin)fail('Somente o administrador altera instrutores.');
   if(b.role==='instrutor'){
    const email=str(b.email,5,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Informe o e-mail ChatGPT do instrutor.');
    const mapped=await first('SELECT value FROM settings WHERE key=?','instructor-email:'+email);if(mapped&&mapped.value!==b.id)fail('Esse e-mail já está associado a outro instrutor.');
    await run('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value','instructor-email:'+email,b.id);
   }
   await run('UPDATE members SET role=? WHERE id=?',b.role,b.id);return json({message:'Perfil atualizado.'});
  }
  if(b.action==='settings'){
   const url=new URL(str(b.discord));if(url.protocol!=='https:'||!['discord.gg','discord.com'].includes(url.hostname))fail('Informe um convite HTTPS do Discord.');
   await run("INSERT INTO settings VALUES ('discord',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",url.href);return json({message:'Discord atualizado.'});
  }
  if(form){
   const file=form.get('file') as File; if(!file||file.size>20000000||file.size<5)fail('Selecione um PDF de até 20 MB.');
   if(new TextDecoder().decode(await file.slice(0,5).arrayBuffer())!=='%PDF-')fail('Arquivo PDF inválido.');
   const title=str(form.get('title'),3,120),kind=form.get('kind'),pages=Number(form.get('pages')),pass=Number(form.get('pass'));
   if(!['biblia','curso'].includes(String(kind))||!Number.isInteger(pages)||pages<1||pages>500||pass<1||pass>100)fail('Revise tipo, páginas e nota mínima.');
   if(kind==='biblia'&&await first("SELECT id FROM courses WHERE kind='biblia'"))fail('A Bíblia Geral já está cadastrada.');
   const questions=JSON.parse(String(form.get('questions')||'[]'));
   if(!Array.isArray(questions)||questions.length>50||(kind==='curso'&&!questions.length))fail('Cadastre entre 1 e 50 questões para o curso.');
   for(const q of questions)if(typeof q.text!=='string'||q.text.length<5||!Array.isArray(q.options)||q.options.length!==4||q.options.some((o:any)=>typeof o!=='string'||!o.trim())||!Number.isInteger(q.answer)||q.answer<0||q.answer>3)fail('Cada questão precisa de texto, quatro opções e resposta entre 0 e 3.');
   const id=crypto.randomUUID(),key='courses/'+id+'.pdf';await env.BUCKET!.put(key,file.stream(),{httpMetadata:{contentType:'application/pdf'}});
   await run('INSERT INTO courses VALUES (?,?,?,?,?,?,?)',id,title,kind,pages,key,JSON.stringify(questions),pass);
   return json({message:'Material publicado na academia.'});
  }
 }
 const c=await first('SELECT * FROM courses WHERE id=?',str(b.course));
 if(!c||(!instructor&&me.role==='aluno'&&c.kind!=='biblia'))return json({error:'Curso indisponível para seu perfil.'},403);
 if(['begin','pulse'].includes(b.action)){
  const page=Number(b.page);if(!Number.isInteger(page)||page<1||page>c.pages)fail('Página inválida.');
  const id=me.id+':'+c.id+':'+page,active='active:'+me.id;
  if(b.action==='begin'){
   await db.batch([db.prepare('INSERT INTO reading VALUES (?,?,?,?,?,?,0,0) ON CONFLICT(id) DO UPDATE SET last=excluded.last').bind(id,me.id,c.id,page,now,now),db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(active,id)]);
  }else{
   if((await first('SELECT value FROM settings WHERE key=?',active))?.value!==id)fail('A leitura está aberta em outra página. Reabra esta página.');
   await run('UPDATE reading SET seconds=MIN(30,seconds+CASE WHEN ?-last BETWEEN 4000 AND 10000 THEN CAST((?-last)/1000 AS INTEGER) ELSE 0 END), last=? WHERE id=?',now,now,now,id);
   await run('UPDATE reading SET done=1 WHERE id=? AND seconds>=30',id);
  }
  return json(await first('SELECT seconds,done FROM reading WHERE id=?',id));
 }
 const read=await first('SELECT COUNT(*) AS n FROM reading WHERE member=? AND course=? AND done=1',me.id,c.id);
 if(read.n<c.pages)fail('Conclua 100% da leitura antes de continuar.');
 if(b.action==='exam'){
  if(c.kind!=='curso')fail('A Bíblia Geral não possui prova teórica.');
  let attempt=await first('SELECT * FROM attempts WHERE member=? AND course=? ORDER BY started DESC LIMIT 1',me.id,c.id);
  if(attempt?.passed)fail('Você já foi aprovado neste curso.');
  if(!attempt||attempt.submitted||now-attempt.started>=900000){
   if(attempt&&!attempt.submitted)await run('UPDATE attempts SET submitted=?,score=0 WHERE id=?',now,attempt.id);
   attempt={id:crypto.randomUUID(),member:me.id,course:c.id,started:now};
   await run('INSERT INTO attempts (id,member,course,started,passed) VALUES (?,?,?,?,0)',attempt.id,me.id,c.id,now);
  }
  return json({id:attempt.id,deadline:attempt.started+900000,questions:JSON.parse(c.questions).map((q:any)=>({text:q.text,options:q.options}))});
 }
 if(b.action==='submit'){
  const a=await first('SELECT * FROM attempts WHERE id=? AND member=? AND course=?',str(b.attempt),me.id,c.id);
  if(!a||a.submitted)fail('Tentativa indisponível ou já enviada.');
  const qs=JSON.parse(c.questions);const score=now-a.started>900000?0:Math.round(qs.filter((q:any,i:number)=>Array.isArray(b.answers)&&q.answer===b.answers[i]).length/qs.length*100);
  const passed=score>=c.pass;
  const result=await run('UPDATE attempts SET submitted=?,score=?,passed=? WHERE id=? AND submitted IS NULL',now,score,passed?1:0,a.id);
  if(!result.meta.changes)fail('Esta tentativa já foi finalizada.');
  return json({message:now-a.started>900000?'Tempo esgotado. Prova encerrada.':passed?'Aprovado! Seu certificado está disponível.':'Nota '+score+'%. Revise a apostila e tente novamente.',score,passed});
 }
 return json({error:'Ação inválida.'},400);
 }catch(e){const msg=e instanceof Error?e.message:'Falha inesperada.';return json({error:msg.includes('UNIQUE')?'Este ID já está cadastrado.':msg.includes('SQLITE')?'Não foi possível salvar. Tente novamente.':msg},400)}}
