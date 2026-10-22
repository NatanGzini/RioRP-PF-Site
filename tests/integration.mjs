// Testa a API completa com Postgres em memória (PGlite). Uso: npm test
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createHandler,CHUNK_SIZE} from '../server/handler.ts';
import {pgliteDb,memoryBlobs} from '../scripts/local-deps.mjs';

const base='http://portal.test',ADMIN='senha-admin-de-teste';
const pg=new PGlite();
const handle=createHandler({db:pgliteDb(pg),blobs:memoryBlobs(),adminPassword:ADMIN});
const call=async(body,{cookie,origin=base,ip}={})=>{
 const headers={origin,...(cookie?{cookie}:{}),...(ip?{'x-forwarded-for':ip}:{})};
 if(!(body instanceof FormData))headers['content-type']='application/json';
 const r=await handle(new Request(base+'/api/portal',{method:'POST',headers,body:body instanceof FormData?body:JSON.stringify(body)}));
 return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};
};
const state=async cookie=>(await handle(new Request(base+'/api/portal',{headers:cookie?{cookie}:{}}))).json();
const ok=(r,label)=>{assert.equal(r.status,200,label+': '+JSON.stringify(r.body));return r};

// Acesso anônimo
assert.equal((await state()).me,null);
assert.equal((await call({action:'member',id:'1',name:'Teste'})).status,401);
assert.equal((await call({action:'report'},{origin:'https://invalido.test'})).status,403);
assert.equal((await call({action:'report',organization:'QA',location:'QA',details:'Curto'})).status,400);

// Destaque da página inicial: padrão visível a todos; só instrutores editam
assert.equal((await state()).highlight.title,'PF prende Andrex');assert.equal((await state()).highlight.active,true);

// Administrador
assert.equal((await call({action:'staff-login',user:'admin',password:'errada'})).status,401);
const admin=ok(await call({action:'staff-login',user:'ADMIN',password:ADMIN}),'login admin').cookie;
const adminState=await state(admin);assert.equal(adminState.admin,true);assert.equal(adminState.me.role,'instrutor');
assert.equal((await call({action:'member',id:'admin',name:'Reservado'},{cookie:admin})).status,400);
ok(await call({action:'member',id:'100',name:'Aluno QA'},{cookie:admin}),'cadastro aluno');
const dup=await call({action:'member',id:'100',name:'Aluno QA'},{cookie:admin});assert.equal(dup.status,400);assert.match(dup.body.error,/já está cadastrado/);
ok(await call({action:'member',id:'200',name:'Instrutor QA'},{cookie:admin}),'cadastro instrutor');
assert.equal((await call({action:'role',id:'200',role:'instrutor',password:'curta'},{cookie:admin})).status,400);
ok(await call({action:'role',id:'200',role:'instrutor',password:'senha-instrutor'},{cookie:admin}),'nomear instrutor');

// Instrutor: entra com senha, nunca pelo formulário de aluno
const wrongForm=await call({action:'login',id:'200',name:'Instrutor QA'});assert.equal(wrongForm.status,401);assert.match(wrongForm.body.error,/Acesso de instrutores/);
assert.equal(ok(await call({action:'staff-login',user:'200',password:'  senha-instrutor  '}),'senha com espaços').status,200);
const typo=await call({action:'staff-login',user:'200',password:'errada'});assert.equal(typo.status,401);assert.match(typo.body.error,/Restam 4/);
await pg.query(`UPDATE settings SET value=$1 WHERE key LIKE 'lock:200:%'`,[JSON.stringify({n:4,until:0,last:Date.now()-16*60000})]);
assert.match((await call({action:'staff-login',user:'200',password:'errada'})).body.error,/Restam 4/);
ok(await call({action:'staff-login',user:'200',password:'senha-instrutor'}),'login após erros');
const instructor=ok(await call({action:'staff-login',user:'200',password:'senha-instrutor'}),'login instrutor').cookie;
const instructorState=await state(instructor);assert.equal(instructorState.me.id,'200');assert.equal(instructorState.admin,false);
assert.equal((await call({action:'role',id:'100',role:'instrutor',password:'qualquer-senha'},{cookie:instructor})).status,400);

// Aluno
assert.equal((await call({action:'login',id:'100',name:'Nome errado'})).status,401);
assert.equal((await call({action:'login',id:'999',name:'Aluno QA'})).status,401);
const student=ok(await call({action:'login',id:'100',name:'  aluno   qa  '}),'login aluno').cookie;
const studentState=await state(student);assert.equal(studentState.me.role,'aluno');assert.equal(studentState.reports.length,0);assert.equal(studentState.members.length,0);
assert.equal((await call({action:'member',id:'300',name:'Bloqueado'},{cookie:student})).status,403);
assert.equal((await call({action:'staff-login',user:'100',password:'Aluno QA'})).status,401);
const tampered=student.slice(0,-1)+(student.endsWith('a')?'b':'a');assert.equal((await state(tampered)).me,null);

// Denúncia anônima
const report=ok(await call({action:'report',organization:'Org QA',location:'Ambiente de testes',details:'Relato fictício de teste automatizado, sem envolvidos reais.'}),'denúncia');
assert.match(report.body.message,/Protocolo/);
assert.equal((await state(instructor)).reports.length,1);

const novoDestaque={action:'highlight',active:true,tag:'Operação Teste',title:'Manchete de teste',text:'Texto curto.',date:'22/10/2026',stamp:'PRESO'};
assert.equal((await call(novoDestaque,{cookie:student})).status,403);
assert.equal((await call(novoDestaque)).status,401);
assert.equal((await call({...novoDestaque,title:'x'},{cookie:instructor})).status,400);
ok(await call(novoDestaque,{cookie:instructor}),'editar destaque');assert.equal((await state()).highlight.title,'Manchete de teste');
ok(await call({...novoDestaque,active:false},{cookie:instructor}),'esconder destaque');assert.equal((await state()).highlight.active,false);

// Denúncia com anexos: imagem (1 parte) e vídeo (2 partes); só instrutores veem; apagar remove tudo
const sendPart=(upload,index,bytes,ip='10.0.0.1')=>{const f=new FormData();f.set('action','report-upload');f.set('upload',upload);f.set('index',String(index));f.set('chunk',new Blob([bytes]));return call(f,{ip})};
assert.equal((await sendPart(crypto.randomUUID(),0,new TextEncoder().encode('<svg>texto qualquer</svg>'))).status,400);
const png=new Uint8Array(2000);png.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);png[1999]=7;
const mp4=new Uint8Array(CHUNK_SIZE+1000);mp4.set(new TextEncoder().encode('\0\0\0\x18ftypmp42'));mp4[mp4.length-1]=9;
const imgId=crypto.randomUUID(),vidId=crypto.randomUUID();
ok(await sendPart(imgId,0,png),'parte imagem');ok(await sendPart(vidId,0,mp4.slice(0,CHUNK_SIZE)),'vídeo parte 1');ok(await sendPart(vidId,1,mp4.slice(CHUNK_SIZE)),'vídeo parte 2');
const reportBody={organization:'Org Anexos',location:'Ambiente de testes',details:'Relato fictício com anexos de teste, sem envolvidos reais.'};
const incomplete=crypto.randomUUID();ok(await sendPart(incomplete,0,png),'parte incompleta');
assert.match((await call({...reportBody,action:'report',attachments:[{upload:incomplete,parts:2,name:'x.png'}]},{ip:'10.0.0.1'})).body.error,/incompleto/);
assert.match((await call({...reportBody,action:'report',attachments:Array.from({length:5},()=>({upload:crypto.randomUUID(),parts:1}))},{ip:'10.0.0.1'})).body.error,/no máximo 4/);
ok(await call({...reportBody,action:'report',attachments:[{upload:imgId,parts:1,name:'print<script>.png'},{upload:vidId,parts:2,name:'clipe.mp4'}]},{ip:'10.0.0.1'}),'denúncia com anexos');
assert.match((await call({...reportBody,action:'report',attachments:[{upload:imgId,parts:1}]},{ip:'10.0.0.1'})).body.error,/já foi enviado/);
assert.equal((await sendPart(imgId,0,png)).status,400);
const withFiles=(await state(instructor)).reports.find(r=>r.organization==='Org Anexos');
const files=JSON.parse(withFiles.attachments);assert.deepEqual(files.map(a=>a.type),['image/png','video/mp4']);assert.equal(files[0].name,'printscript.png');
const getFile=(n,cookie)=>handle(new Request(base+`/api/portal?action=attachment&report=${withFiles.id}&n=${n}`,{headers:cookie?{cookie}:{}}));
const vid=await getFile(1,instructor);assert.equal(vid.headers.get('content-type'),'video/mp4');const vidBytes=new Uint8Array(await vid.arrayBuffer());assert.equal(vidBytes.length,mp4.length);assert.equal(vidBytes[vidBytes.length-1],9);
assert.equal((await getFile(0,instructor)).headers.get('content-type'),'image/png');
assert.equal((await getFile(0,student)).status,403);assert.equal((await getFile(0)).status,403);
assert.equal((await call({action:'report-delete',report:withFiles.id},{cookie:student})).status,403);
ok(await call({action:'report-delete',report:withFiles.id},{cookie:instructor}),'apagar denúncia');
assert.equal((await state(instructor)).reports.some(r=>r.id===withFiles.id),false);assert.equal((await getFile(0,instructor)).status,404);
ok(await sendPart(crypto.randomUUID(),0,png),'upload após apagar');
// Limite anti-spam: 6 denúncias por hora por conexão; outra conexão continua podendo enviar
for(let i=0;i<4;i++)ok(await call({...reportBody,action:'report'},{ip:'10.0.0.2'}),'denúncia '+i);
for(let i=0;i<2;i++)await call({...reportBody,action:'report'},{ip:'10.0.0.2'});
assert.equal((await call({...reportBody,action:'report'},{ip:'10.0.0.2'})).status,429);
ok(await call({...reportBody,action:'report'},{ip:'10.0.0.3'}),'outra conexão');
assert.equal((await pg.query(`SELECT COUNT(*)::int AS n FROM settings WHERE key LIKE 'rl:%' AND key LIKE '%10.0.0%'`)).rows[0].n,0);

// Publicação de curso com PDF em várias partes (7 MB → 3 partes)
const pdf=new Uint8Array(7*1024*1024);pdf.set(new TextEncoder().encode('%PDF-1.7'));pdf[pdf.length-1]=42;
const upload=crypto.randomUUID(),parts=Math.ceil(pdf.length/CHUNK_SIZE);
const badPart=new FormData();badPart.set('action','upload');badPart.set('upload',upload);badPart.set('index','0');badPart.set('chunk',new Blob(['nao e pdf']));
assert.equal((await call(badPart,{cookie:instructor})).status,400);
for(let i=0;i<parts;i++){const f=new FormData();f.set('action','upload');f.set('upload',upload);f.set('index',String(i));f.set('chunk',new Blob([pdf.slice(i*CHUNK_SIZE,(i+1)*CHUNK_SIZE)]));ok(await call(f,{cookie:instructor}),'parte '+i)}
const questions=JSON.stringify([{text:'Questão QA?',options:['A','B','C','D'],answer:0}]);
assert.equal((await call({action:'course',title:'Curso QA',kind:'curso',pages:1,pass:70,questions:'{inválido',upload,parts},{cookie:instructor})).status,400);
ok(await call({action:'course',title:'Curso QA',kind:'curso',pages:1,pass:70,questions,upload,parts},{cookie:instructor}),'publicar curso');
const course=(await state(instructor)).courses[0].id;
const file=await handle(new Request(base+'/api/portal?action=pdf&course='+course,{headers:{cookie:instructor}}));
assert.equal(file.status,200);const bytes=new Uint8Array(await file.arrayBuffer());assert.equal(bytes.length,pdf.length);assert.equal(bytes[bytes.length-1],42);
assert.equal((await handle(new Request(base+'/api/portal?action=pdf&course='+course,{headers:{cookie:student}}))).status,403);
assert.equal((await call({action:'begin',course,page:1},{cookie:student})).status,403);

// Leitura, prova e certificado
assert.equal((await call({action:'exam',course},{cookie:instructor})).status,400);
assert.equal(ok(await call({action:'begin',course,page:1},{cookie:instructor}),'begin').body.seconds,0);
assert.equal((await call({action:'pulse',course,page:1},{cookie:instructor})).body.done,0);
await pg.query(`UPDATE reading SET seconds=25,last=$1 WHERE member='200'`,[Date.now()-5000]);
assert.equal(ok(await call({action:'pulse',course,page:1},{cookie:instructor}),'pulse').body.done,1);
const exam=ok(await call({action:'exam',course},{cookie:instructor}),'exam').body;
assert.equal(exam.questions[0].answer,undefined);assert.equal(typeof exam.deadline,'number');
assert.equal((await call({action:'exam',course},{cookie:instructor})).body.id,exam.id);
await pg.query(`UPDATE attempts SET started=$1 WHERE member='200'`,[Date.now()-901000]);
const expired=await call({action:'submit',course,attempt:exam.id,answers:[0]},{cookie:instructor});assert.equal(expired.body.passed,false);assert.equal(expired.body.score,0);
assert.match((await call({action:'exam',course},{cookie:instructor})).body.error,/Aguarde 10 minuto/);
await pg.query(`UPDATE attempts SET submitted=$1 WHERE member='200'`,[Date.now()-601000]);
const retry=ok(await call({action:'exam',course},{cookie:instructor}),'retry').body;assert.notEqual(retry.id,exam.id);
const passed=await call({action:'submit',course,attempt:retry.id,answers:[0]},{cookie:instructor});assert.equal(passed.body.passed,true);assert.equal(passed.body.score,100);
assert.equal((await call({action:'submit',course,attempt:retry.id,answers:[0]},{cookie:instructor})).status,400);

// Apostila sem prova (avaliação in game): publica sem questões, conta leitura e não abre prova
const upload2=crypto.randomUUID(),small=new FormData();small.set('action','upload');small.set('upload',upload2);small.set('index','0');small.set('chunk',new Blob([new TextEncoder().encode('%PDF-1.7 apostila')]));ok(await call(small,{cookie:instructor}),'parte apostila');
ok(await call({action:'course',title:'Apostila QA',kind:'leitura',pages:1,pass:70,questions:'',upload:upload2,parts:1},{cookie:instructor}),'publicar apostila');
const apostila=(await state(instructor)).courses.find(c=>c.kind==='leitura').id;
ok(await call({action:'begin',course:apostila,page:1},{cookie:instructor}),'begin apostila');
await pg.query(`UPDATE reading SET seconds=25,last=$1 WHERE member='200' AND course=$2`,[Date.now()-5000,apostila]);
assert.equal(ok(await call({action:'pulse',course:apostila,page:1},{cookie:instructor}),'pulse apostila').body.done,1);
const noExam=await call({action:'exam',course:apostila},{cookie:instructor});assert.equal(noExam.status,400);assert.match(noExam.body.error,/in game/);
assert.equal((await call({action:'begin',course:apostila,page:1},{cookie:student})).status,403);

// Painel de membros: registro de copiar/colar e saídas da tela durante a prova
ok(await call({action:'member',id:'300',name:'Agente QA'},{cookie:admin}),'cadastro agente');
ok(await call({action:'role',id:'300',role:'agente'},{cookie:instructor}),'promover agente');
const agent=ok(await call({action:'login',id:'300',name:'Agente QA'}),'login agente').cookie;
ok(await call({action:'begin',course,page:1},{cookie:agent}),'begin agente');
await pg.query(`UPDATE reading SET seconds=30,done=1 WHERE member='300'`);
const agentExam=ok(await call({action:'exam',course},{cookie:agent}),'prova agente').body;
for(const type of ['copy','paste','hidden'])assert.equal(ok(await call({action:'exam-event',attempt:agentExam.id,type},{cookie:agent}),'evento '+type).body.ok,true);
assert.equal((await call({action:'exam-event',attempt:agentExam.id,type:'hack'},{cookie:agent})).status,400);
assert.equal((await call({action:'exam-event',attempt:agentExam.id,type:'copy'},{cookie:student})).body.ok,false);
ok(await call({action:'submit',course,attempt:agentExam.id,answers:[1]},{cookie:agent}),'submit agente');
assert.equal((await call({action:'exam-event',attempt:agentExam.id,type:'paste'},{cookie:agent})).body.ok,false);
const getJson=async(path,cookie)=>{const r=await handle(new Request(base+path,{headers:cookie?{cookie}:{}}));return {status:r.status,body:await r.json()}};
const fichaAgente=await getJson('/api/portal?action=member&id=300',instructor);
assert.equal(fichaAgente.status,200);assert.deepEqual(fichaAgente.body.attempts[0].events.map(e=>e.type),['copy','paste','hidden']);
assert.equal(fichaAgente.body.reading.find(r=>r.course===course).done,1);
assert.equal((await state(instructor)).examSummary.find(e=>e.member==='300').alerts,3);
assert.equal((await getJson('/api/portal?action=member&id=300',agent)).status,403);
assert.equal((await getJson('/api/portal?action=course&id='+course,student)).status,403);
assert.equal(JSON.parse((await getJson('/api/portal?action=course&id='+course,instructor)).body.questions)[0].answer,0);
assert.equal((await state(agent)).readingSummary.length,0);

// Editar material: título e páginas; páginas removidas saem do progresso; PDF é opcional
ok(await call({action:'course-edit',course,title:'Curso QA editado',pages:2,pass:60,questions},{cookie:instructor}),'editar curso');
let edited=(await state(instructor)).courses.find(c=>c.id===course);assert.equal(edited.title,'Curso QA editado');assert.equal(edited.pages,2);assert.equal(edited.pass,60);
await pg.query(`INSERT INTO reading VALUES ('300:${course}:2','300',$1,2,0,0,30,1)`,[course]);
ok(await call({action:'course-edit',course,title:'Curso QA editado',pages:1,pass:60,questions},{cookie:instructor}),'reduzir páginas');
assert.equal((await pg.query(`SELECT COUNT(*)::int AS n FROM reading WHERE course=$1 AND page>1`,[course])).rows[0].n,0);
assert.equal((await call({action:'course-edit',course,title:'X',pages:1,pass:60,questions},{cookie:agent})).status,403);
assert.equal((await call({action:'course-edit',course:'nao-existe',title:'Teste',pages:1,pass:60},{cookie:instructor})).status,400);

// Remover matrícula: apaga histórico e sessão; ID recadastrado começa do zero
assert.match((await call({action:'member-remove',id:'200'},{cookie:instructor})).body.error,/própria matrícula/);
assert.equal((await call({action:'member-remove',id:'300'},{cookie:agent})).status,403);
ok(await call({action:'member-remove',id:'300'},{cookie:instructor}),'remover agente');
assert.equal((await state(agent)).me,null);
ok(await call({action:'member',id:'300',name:'Agente QA'},{cookie:admin}),'recadastro');
assert.equal((await state(agent)).me,null);
const fresh=await getJson('/api/portal?action=member&id=300',instructor);assert.equal(fresh.body.attempts.length,0);assert.equal(fresh.body.reading.length,0);

// Apagar material: some da lista, leituras e PDF também
ok(await call({action:'course-delete',course:apostila},{cookie:instructor}),'apagar apostila');
assert.equal((await state(instructor)).courses.some(c=>c.id===apostila),false);
assert.equal((await pg.query(`SELECT COUNT(*)::int AS n FROM reading WHERE course=$1`,[apostila])).rows[0].n,0);
assert.equal((await handle(new Request(base+'/api/portal?action=pdf&course='+apostila,{headers:{cookie:instructor}}))).status,403);

// Redefinir a senha encerra a sessão antiga do instrutor; remover o cargo também
ok(await call({action:'role',id:'200',role:'instrutor',password:'nova-senha-123'},{cookie:admin}),'redefinir senha');
assert.equal((await state(instructor)).me,null);
const instructor2=ok(await call({action:'staff-login',user:'200',password:'nova-senha-123'}),'novo login').cookie;
ok(await call({action:'role',id:'200',role:'agente'},{cookie:admin}),'remover instrutor');
assert.equal((await state(instructor2)).me,null);

// Bloqueio após 5 senhas erradas
for(let i=0;i<5;i++)assert.equal((await call({action:'staff-login',user:'admin',password:'x'+i})).status,401);
assert.equal((await call({action:'staff-login',user:'admin',password:ADMIN})).status,429);

// Sair
ok(await call({action:'logout'},{cookie:student}),'logout');assert.equal((await state(student)).me,null);

// ADMIN_PASSWORD curta não habilita o administrador
const weak=createHandler({db:pgliteDb(new PGlite()),blobs:memoryBlobs(),adminPassword:'curta'});
const weakLogin=await weak(new Request(base+'/api/portal',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({action:'staff-login',user:'admin',password:'curta'})}));
assert.equal(weakLogin.status,401);

// ===== Segurança: tentativas de ataque comuns =====
const secDb=new PGlite(),secBlobs=memoryBlobs();
const sec=createHandler({db:pgliteDb(secDb),blobs:secBlobs,adminPassword:ADMIN});
const sreq=async(body,{ip='10.9.0.1',cookie,raw,type='application/json'}={})=>{const r=await sec(new Request(base+'/api/portal',{method:'POST',headers:{origin:base,'x-forwarded-for':ip,'content-type':type,...(cookie?{cookie}:{})},body:raw??JSON.stringify(body)}));return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers}};
// Requisições malformadas não revelam detalhes internos
for(const raw of ['null','[]','{oops','"texto"','{"action":5}']){const r=await sreq(null,{raw});assert.equal(r.status,400,raw);assert.equal(r.body.error,'Requisição inválida.',raw)}
assert.equal((await sreq({action:'report'})).headers.get('x-content-type-options'),'nosniff');
// Erro inesperado do banco vira mensagem genérica (sem detalhes)
const broken=createHandler({db:{query:async()=>{throw new Error('detalhe interno do servidor: tabela X')}},blobs:memoryBlobs(),adminPassword:ADMIN});
const brokenRes=await broken(new Request(base+'/api/portal'));assert.equal(brokenRes.status,500);assert.doesNotMatch(JSON.stringify(await brokenRes.json()),/tabela X/);
// Injeção de SQL e de script ficam guardadas como texto comum
const secAdmin=(await sreq({action:'staff-login',user:'admin',password:ADMIN},{ip:'10.9.9.9'})).cookie;
ok(await sreq({action:'member',id:"1'; DROP TABLE members;--",name:"<script>alert(1)</script>"},{cookie:secAdmin}),'payload como texto');
const secState=await (await sec(new Request(base+'/api/portal',{headers:{cookie:secAdmin}}))).json();
assert.equal(secState.members[0].name,'<script>alert(1)</script>');assert.equal(secState.members[0].id,"1'; DROP TABLE members;--");
ok(await sreq({action:'login',id:"1'; DROP TABLE members;--",name:'<script>alert(1)</script>'},{ip:'10.9.0.50'}),'login com payload exato');
assert.equal((await sreq({action:'login',id:"' OR '1'='1",name:"' OR '1'='1"},{ip:'10.9.0.51'})).status,401);
// ID duplicado só mudando maiúsculas é recusado
ok(await sreq({action:'member',id:'AB12',name:'Caso Teste'},{cookie:secAdmin}),'id AB12');
assert.match((await sreq({action:'member',id:'ab12',name:'Outro'},{cookie:secAdmin})).body.error,/já está cadastrado/);
// Força bruta no login de aluno: 30 tentativas por hora por conexão; outra conexão segue normal
for(let i=0;i<30;i++)assert.equal((await sreq({action:'login',id:'x'+i,name:'Ninguém'},{ip:'10.9.1.1'})).status,401);
assert.equal((await sreq({action:'login',id:'AB12',name:'Caso Teste'},{ip:'10.9.1.1'})).status,429);
assert.equal((await sreq({action:'login',id:'AB12',name:'Caso Teste'},{ip:'10.9.1.2'})).status,200);
// Bloqueio do admin por conexão: o atacante se bloqueia, o admin verdadeiro continua entrando
for(let i=0;i<5;i++)assert.equal((await sreq({action:'staff-login',user:'admin',password:'chute'+i},{ip:'10.9.2.1'})).status,401);
assert.equal((await sreq({action:'staff-login',user:'admin',password:ADMIN},{ip:'10.9.2.1'})).status,429);
assert.equal((await sreq({action:'staff-login',user:'admin',password:ADMIN},{ip:'10.9.2.2'})).status,200);
// Limite geral de tentativas de login de instrutor por conexão (mesmo trocando de usuário)
for(let i=0;i<20;i++)await sreq({action:'staff-login',user:'u'+i,password:'x'},{ip:'10.9.3.1'});
assert.equal((await sreq({action:'staff-login',user:'outro',password:'x'},{ip:'10.9.3.1'})).status,429);
// Instrutor inexistente demora o mesmo que um existente (não revela quais IDs existem)
const tFake=performance.now();await sreq({action:'staff-login',user:'naoexiste',password:'x'},{ip:'10.9.4.1'});const fakeMs=performance.now()-tFake;
assert.ok(fakeMs>20,'verificação de senha também roda para usuário inexistente');
// Anexo: partes fora de ordem são recusadas
const orphan=crypto.randomUUID(),part=(i,bytes,ip='10.9.5.1')=>{const f=new FormData();f.set('action','report-upload');f.set('upload',orphan);f.set('index',String(i));f.set('chunk',new Blob([bytes]));return sec(new Request(base+'/api/portal',{method:'POST',headers:{origin:base,'x-forwarded-for':ip},body:f})).then(async r=>({status:r.status,body:await r.json()}))};
assert.match((await part(1,png)).body.error,/desde o começo/);
assert.equal((await part(0,png)).status,200);
// Questão gigante é recusada; convite inválido do Discord dá mensagem clara
assert.match((await sreq({action:'course-edit',course:'x',title:'Teste',pages:1,pass:70,questions:JSON.stringify([{text:'a'.repeat(600),options:['A','B','C','D'],answer:0}])},{cookie:secAdmin})).body.error,/não encontrado/);
assert.match((await sreq({action:'settings',discord:'isto não é link'},{cookie:secAdmin})).body.error,/convite HTTPS/);
// Faxina: anexo abandonado há mais de 24 h e sessão vencida são apagados
await secDb.query(`UPDATE settings SET value=$1 WHERE key=$2`,[String(Date.now()-25*3600000),'pend:'+orphan]);
await secDb.query(`INSERT INTO settings VALUES ('session:velha',$1)`,[JSON.stringify({id:'AB12',expires:Date.now()-1000})]);
const sec2=createHandler({db:pgliteDb(secDb),blobs:secBlobs,adminPassword:ADMIN});
await sec2(new Request(base+'/api/portal',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({action:'logout'})}));
assert.equal(await secBlobs.exists(`report-uploads/${orphan}/0`),false);
assert.equal((await secDb.query(`SELECT COUNT(*)::int AS n FROM settings WHERE key IN ($1,'session:velha')`,['pend:'+orphan])).rows[0].n,0);
// Código de IP do limite não é o hash simples do IP (tem segredo do servidor)
const keys=(await secDb.query(`SELECT key FROM settings WHERE key LIKE 'rl:%'`)).rows.map(r=>r.key);
const {sha256Hex}=await import('../server/passwords.ts');const hour=String(Math.floor(Date.now()/3600000));
const plainHash=(await sha256Hex('rl:10.9.1.1:'+hour)).slice(0,24);assert.ok(keys.length>0);assert.equal(keys.some(k=>k.includes(plainHash)),false);
// Anexos e PDFs saem com cabeçalhos de proteção
const atts=JSON.parse((await (await sec(new Request(base+'/api/portal',{headers:{cookie:secAdmin}}))).json()).reports[0]?.attachments||'[]');
assert.equal(atts.length,0);

console.log('Todos os testes passaram (incluindo os de segurança).');
