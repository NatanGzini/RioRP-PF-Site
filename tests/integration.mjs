// Testa a API completa com Postgres em memória (PGlite). Uso: npm test
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {createHandler,CHUNK_SIZE} from '../server/handler.ts';
import {pgliteDb,memoryBlobs,applyMigrations} from '../scripts/local-deps.mjs';

const base='http://portal.test',ADMIN='senha-admin-de-teste';
const pg=await applyMigrations(new PGlite());
const handle=createHandler({db:pgliteDb(pg),blobs:memoryBlobs(),adminPassword:ADMIN});
const call=async(body,{cookie,origin=base}={})=>{
 const headers={origin,...(cookie?{cookie}:{})};
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
assert.equal((await call({action:'login',id:'200',name:'Instrutor QA'})).status,401);
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
const retry=ok(await call({action:'exam',course},{cookie:instructor}),'retry').body;assert.notEqual(retry.id,exam.id);
const passed=await call({action:'submit',course,attempt:retry.id,answers:[0]},{cookie:instructor});assert.equal(passed.body.passed,true);assert.equal(passed.body.score,100);
assert.equal((await call({action:'submit',course,attempt:retry.id,answers:[0]},{cookie:instructor})).status,400);

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
const weak=createHandler({db:pgliteDb(await applyMigrations(new PGlite())),blobs:memoryBlobs(),adminPassword:'curta'});
const weakLogin=await weak(new Request(base+'/api/portal',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({action:'staff-login',user:'admin',password:'curta'})}));
assert.equal(weakLogin.status,401);

console.log('Todos os testes passaram.');
