import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const base='http://127.0.0.1:5173';
const prefix='qa-'+Date.now(),member=prefix+'-instructor',course=prefix+'-course',student=prefix+'-student';
const sql=q=>execFileSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--command',q],{stdio:'pipe'});
const send=async(body,auth=true,origin=base)=>{const r=await fetch(base+'/api/portal',{method:'POST',headers:{'content-type':'application/json',origin,...(auth?{cookie:'__sites_local_auth=1'}:{})},body:JSON.stringify(body)});const raw=await r.text();let bodyResult;try{bodyResult=JSON.parse(raw)}catch{bodyResult={error:raw}}return {status:r.status,body:bodyResult}};
const state=async()=>{const r=await fetch(base+'/api/portal',{headers:{cookie:'__sites_local_auth=1'}});return r.json()};
let reportId;
try{
 assert.equal((await send({action:'member',id:student,name:'Teste QA'},false)).status,401);
 assert.equal((await send({action:'report'},false,'https://invalid.test')).status,403);
 assert.equal((await send({action:'report',organization:'QA',location:'QA',details:'Curto'},false)).status,400);
 sql(`INSERT INTO members (id,name,role,user_id,created) VALUES ('${member}','Instrutor QA','instrutor','local_seedy',0); INSERT INTO courses VALUES ('${course}','Curso QA','curso',1,'qa.pdf','[{"text":"Questao QA?","options":["A","B","C","D"],"answer":0}]',70);`);
 assert.equal((await state()).me.role,'instrutor');
 const created=await send({action:'member',id:student,name:'Aluno QA'});assert.equal(created.status,200);assert.ok(created.body.code);
 assert.equal((await send({action:'member',id:student,name:'Aluno QA'})).status,400);
 const report=await send({action:'report',organization:prefix,location:'Ambiente de testes',details:'Relato ficticio de teste automatizado local, sem envolvidos reais.'},false);assert.equal(report.status,200);
 const list=await state();reportId=list.reports.find(r=>r.organization===prefix).id;assert.ok(!('user_id' in list.reports[0]));
 assert.equal((await send({action:'role',id:student,role:'instrutor'})).status,400);
 assert.equal((await send({action:'exam',course})).status,400);
 const start=await send({action:'begin',course,page:1});assert.equal(start.body.seconds,0);
 const fast=await send({action:'pulse',course,page:1});assert.equal(fast.body.done,0);assert.equal(fast.body.seconds,0);
 sql(`UPDATE reading SET seconds=25,last=${Date.now()-5000} WHERE member='${member}';`);
 const completed=await send({action:'pulse',course,page:1});assert.equal(completed.body.done,1);
 const ex=await send({action:'exam',course});assert.equal(ex.status,200);assert.equal(ex.body.questions[0].answer,undefined);
 const resumed=await send({action:'exam',course});assert.equal(resumed.body.id,ex.body.id);assert.equal(resumed.body.deadline,ex.body.deadline);
 sql(`UPDATE attempts SET started=${Date.now()-901000} WHERE member='${member}';`);
 const expired=await send({action:'submit',course,attempt:ex.body.id,answers:[0]});assert.equal(expired.body.passed,false);assert.equal(expired.body.score,0);
 const retry=await send({action:'exam',course});const success=await send({action:'submit',course,attempt:retry.body.id,answers:[0]});assert.equal(success.body.passed,true);assert.equal(success.body.score,100);
 assert.equal((await send({action:'submit',course,attempt:retry.body.id,answers:[0]})).status,400);
 sql(`UPDATE members SET role='aluno' WHERE id='${member}';`);
 const restricted=await state();assert.equal(restricted.reports.length,0);assert.equal(restricted.members.length,0);assert.equal(restricted.courses.length,0);
 assert.equal((await send({action:'begin',course,page:1})).status,403);
 assert.equal((await send({action:'member',id:prefix+'-blocked',name:'Bloqueado'})).status,403);
 console.log('PASS: anonymous access, origin validation, report privacy, instructor-only enrollment, duplicate IDs, instructor privilege boundary, reading timer, exam lock, hidden answers, persistent deadline, expiration, grading, duplicate submission, student course isolation.');
}finally{
 sql(`DELETE FROM reading WHERE member='${member}'; DELETE FROM attempts WHERE member='${member}'; DELETE FROM courses WHERE id='${course}'; DELETE FROM members WHERE id IN ('${member}','${student}'); DELETE FROM settings WHERE key='active:${member}'; DELETE FROM reports WHERE organization='${prefix}';`);
}

