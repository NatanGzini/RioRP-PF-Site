// Central dos instrutores: membros (com ficha de leitura, provas e alertas), materiais, cadastro e denúncias.
import {useState} from 'react';
import {Users,BookOpen,Plus,Settings,ClipboardList,Check,Search,Pencil,ChevronLeft,AlertTriangle,X} from 'lucide-react';

type Course={id:string;title:string;kind:string;pages:number;pass:number};
type Props={data:any;busy:boolean;error:string;discord:string;
 action:(body:any)=>Promise<any>;api:(body:any)=>Promise<any>;refresh:()=>Promise<void>;
 setBusy:(b:boolean)=>void;setError:(s:string)=>void;setNotice:(s:string)=>void};

const CHUNK_SIZE=3*1024*1024; // igual a server/handler.ts: cada envio fica abaixo do limite de 6 MB das funções Netlify
const ROLE:Record<string,string>={aluno:'Aluno',agente:'Agente',instrutor:'Instrutor'};
const KIND:Record<string,string>={biblia:'Bíblia Geral · alunos',curso:'Curso · prova online',leitura:'Apostila · avaliação in game'};
const EVENT:Record<string,string>={copy:'Copiou',cut:'Recortou',paste:'Colou',hidden:'Saiu da aba / minimizou',blur:'Trocou de janela'};
const date=(t?:number)=>t?new Date(t).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
const minutes=(s:number)=>s<60?`${s}s`:`${Math.round(s/60)} min`;
// Materiais que cada perfil enxerga: alunos só a Bíblia Geral; agentes e instrutores, todos.
const visible=(courses:Course[],role:string)=>courses.filter(c=>role!=='aluno'||c.kind==='biblia');

function Confirm({label,confirm,onConfirm,busy,danger=true}:{label:string;confirm:string;onConfirm:()=>void;busy:boolean;danger?:boolean}){
 const [open,setOpen]=useState(false);
 if(!open)return <button className={danger?'danger-link':''} disabled={busy} onClick={()=>setOpen(true)}>{label}</button>;
 return <span className="confirm-inline"><span>{confirm}</span><button className="danger-solid" disabled={busy} onClick={()=>{setOpen(false);onConfirm()}}>Sim</button><button disabled={busy} onClick={()=>setOpen(false)}>Não</button></span>;
}

export default function Gestao({data,busy,error,discord,action,api,refresh,setBusy,setError,setNotice}:Props){
 const [view,setView]=useState('membros'),[query,setQuery]=useState(''),[roleFilter,setRoleFilter]=useState('todos');
 const [ficha,setFicha]=useState<any>(null),[instructorForm,setInstructorForm]=useState<{id:string,name:string,reset:boolean}|null>(null),[showPassword,setShowPassword]=useState(false);
 const [editing,setEditing]=useState<any>(null);
 const courses:Course[]=data.courses;

 async function uploadPdf(file:File){
  if(!file?.size||file.size>20*1024*1024)throw new Error('Selecione um PDF de até 20 MB.');
  const upload=crypto.randomUUID(),parts=Math.ceil(file.size/CHUNK_SIZE);
  for(let i=0;i<parts;i++){setNotice(`Enviando PDF… parte ${i+1} de ${parts}`);const part=new FormData();part.set('action','upload');part.set('upload',upload);part.set('index',String(i));part.set('chunk',file.slice(i*CHUNK_SIZE,(i+1)*CHUNK_SIZE));await api(part)}
  return {upload,parts};
 }
 async function saveMaterial(f:HTMLFormElement,id?:string){
  const v=new FormData(f),file=v.get('file') as File|null;
  setBusy(true);setError('');setNotice('');
  try{
   const pdf=file&&file.size?await uploadPdf(file):id?{}:await uploadPdf(file as File);
   const d=await api({action:id?'course-edit':'course',course:id,...pdf,title:v.get('title'),kind:v.get('kind'),pages:v.get('pages'),pass:v.get('pass'),questions:v.get('questions')});
   setNotice(d.message);f.reset();setEditing(null);await refresh();
  }catch(e:any){setNotice('');setError(e.message)}finally{setBusy(false)}
 }
 async function openEdit(c:Course){
  try{const r=await fetch('/api/portal?action=course&id='+encodeURIComponent(c.id));const d=await r.json();if(!r.ok)throw new Error(d.error);setEditing(d);setError('')}catch(e:any){setError(e.message)}
 }
 async function openFicha(id:string){
  setError('');try{const r=await fetch('/api/portal?action=member&id='+encodeURIComponent(id));const d=await r.json();if(!r.ok)throw new Error(d.error);setFicha(d);setInstructorForm(null);window.scrollTo({top:0})}catch(e:any){setError(e.message)}
 }
 async function memberAction(body:any){const d=await action(body);if(d&&ficha){if(body.action==='member-remove')setFicha(null);else await openFicha(ficha.member.id)}return d}
 async function saveInstructor(f:HTMLFormElement){
  if(!instructorForm)return;const v=new FormData(f),password=String(v.get('password')||'').trim();
  if(password.length<8){setError('A senha precisa ter pelo menos 8 caracteres.');return}
  if(password!==String(v.get('confirm')||'').trim()){setError('As duas senhas não são iguais. Digite de novo.');return}
  const d=await memberAction({action:'role',id:instructorForm.id,role:'instrutor',password});
  if(d){setNotice(`Pronto! ${instructorForm.name} entra em Academia → Acesso de instrutores, com o usuário ${instructorForm.id} e a senha definida.`);setInstructorForm(null)}
 }

 // Resumo por membro, a partir dos dados agregados enviados pelo servidor.
 const progressOf=(member:string,c:Course)=>Math.min(100,Math.round(100*(data.readingSummary.find((r:any)=>r.member===member&&r.course===c.id)?.done||0)/c.pages));
 const summary=(m:any)=>{
  const list=visible(courses,m.role),done=list.filter(c=>progressOf(m.id,c)===100).length;
  const exams=data.examSummary.filter((e:any)=>e.member===m.id);
  const last=Math.max(0,...data.readingSummary.filter((r:any)=>r.member===m.id).map((r:any)=>r.last||0));
  return {total:list.length,done,passed:exams.filter((e:any)=>e.passed).length,alerts:exams.reduce((s:number,e:any)=>s+e.alerts,0),last};
 };
 const members=data.members.filter((m:any)=>(roleFilter==='todos'||m.role===roleFilter)&&(m.name+' '+m.id).toLowerCase().includes(query.trim().toLowerCase()));

 const tabs=[['membros','Membros',Users],['materiais','Materiais',BookOpen],['cadastro','Cadastro e comunidade',Settings],['denuncias','Denúncias',ClipboardList]] as const;
 return <section className="inner"><div className="eyebrow">ACESSO DOS INSTRUTORES</div><h1>Central da academia.</h1><p className="lead">Acompanhe os membros, gerencie materiais e consulte as informações recebidas.</p>
 <div className="subtabs" role="tablist">{tabs.map(([id,label,Icon])=><button key={id} role="tab" aria-selected={view===id} className={view===id?'active':''} onClick={()=>{setView(id);setFicha(null);setEditing(null);setError('');refresh()}}><Icon size={16}/>{label}{id==='membros'&&<span className="count">{data.members.length}</span>}{id==='denuncias'&&!!data.reports.length&&<span className="count">{data.reports.length}</span>}</button>)}</div>

 {view==='membros'&&!ficha&&<section className="panel form">
  <div className="toolbar"><label className="search"><Search size={16}/><input placeholder="Buscar por nome ou ID" value={query} onChange={e=>setQuery(e.target.value)}/></label><select value={roleFilter} onChange={e=>setRoleFilter(e.target.value)} aria-label="Filtrar por cargo"><option value="todos">Todos os cargos</option><option value="aluno">Alunos</option><option value="agente">Agentes</option><option value="instrutor">Instrutores</option></select></div>
  {!members.length?<p>Nenhum membro encontrado.</p>:<div className="table-scroll"><table><thead><tr><th>ID</th><th>Nome in-game</th><th>Cargo</th><th>Leitura</th><th>Provas</th><th>Último estudo</th><th></th></tr></thead><tbody>{members.map((m:any)=>{const s=summary(m);return <tr key={m.id}><td>{m.id}</td><td>{m.name}</td><td><span className={'role role-'+m.role}>{ROLE[m.role]}</span></td><td>{s.total?<span className={s.done===s.total?'ok':''}>{s.done} de {s.total} concluídos</span>:'—'}</td><td>{s.passed?`${s.passed} aprovado(s)`:'—'}{s.alerts>0&&<span className="alert-badge" title="Copiar, colar ou saídas da tela durante provas"><AlertTriangle size={12}/>{s.alerts}</span>}</td><td>{date(s.last||undefined)}</td><td><button className="text-link" onClick={()=>openFicha(m.id)}>Ver ficha</button></td></tr>})}</tbody></table></div>}
 </section>}

 {view==='membros'&&ficha&&<section className="panel form ficha">
  <button className="back" onClick={()=>{setFicha(null);setInstructorForm(null)}}><ChevronLeft size={16}/> Todos os membros</button>
  <div className="ficha-head"><div><h2>{ficha.member.name}</h2><p>ID {ficha.member.id} · <span className={'role role-'+ficha.member.role}>{ROLE[ficha.member.role]}</span> · cadastrado em {date(ficha.member.created)}</p></div>
   <div className="table-actions">
    {ficha.member.role==='aluno'&&<button disabled={busy} onClick={()=>memberAction({action:'role',id:ficha.member.id,role:'agente'})}>Promover a agente</button>}
    {ficha.member.role==='agente'&&<button disabled={busy} onClick={()=>memberAction({action:'role',id:ficha.member.id,role:'aluno'})}>Voltar para aluno</button>}
    {data.admin&&ficha.member.role!=='instrutor'&&<button disabled={busy} onClick={()=>{setInstructorForm({id:ficha.member.id,name:ficha.member.name,reset:false});setError('')}}>Nomear instrutor</button>}
    {data.admin&&ficha.member.role==='instrutor'&&<><button disabled={busy} onClick={()=>{setInstructorForm({id:ficha.member.id,name:ficha.member.name,reset:true});setError('')}}>Redefinir senha</button><Confirm busy={busy} danger={false} label="Remover cargo de instrutor" confirm="Volta a ser agente?" onConfirm={()=>memberAction({action:'role',id:ficha.member.id,role:'agente'})}/></>}
    {(ficha.member.role!=='instrutor'||data.admin)&&ficha.member.id!==data.me.id&&<Confirm busy={busy} label="Remover matrícula" confirm="Apagar matrícula e todo o histórico?" onConfirm={()=>memberAction({action:'member-remove',id:ficha.member.id})}/>}
   </div></div>
  {instructorForm&&<form className="instructor-form" onSubmit={e=>{e.preventDefault();saveInstructor(e.currentTarget)}}><h3>{instructorForm.reset?'Nova senha para':'Nomear como instrutor:'} {instructorForm.name} <small>(ID {instructorForm.id})</small></h3><p>O instrutor vai entrar em <b>Academia → Acesso de instrutores</b>, com o usuário <b>{instructorForm.id}</b> e esta senha. Combine a senha com ele pessoalmente ou por mensagem privada.</p><div className="form-columns"><label>Senha (mínimo 8 caracteres)<input name="password" autoFocus type={showPassword?'text':'password'} required minLength={8} maxLength={200} autoComplete="new-password" autoCapitalize="off" autoCorrect="off" spellCheck={false}/></label><label>Repita a senha<input name="confirm" type={showPassword?'text':'password'} required minLength={8} maxLength={200} autoComplete="new-password" autoCapitalize="off" autoCorrect="off" spellCheck={false}/></label></div><label className="radio"><input type="checkbox" checked={showPassword} onChange={e=>setShowPassword(e.target.checked)}/>Mostrar senha</label>{error&&<p role="alert" className="modal-error">{error}</p>}<div className="modal-actions"><button type="button" className="button outline" onClick={()=>setInstructorForm(null)}>Cancelar</button><button className="button gold" disabled={busy}>{instructorForm.reset?'Salvar nova senha':'Nomear instrutor'} <Check size={17}/></button></div></form>}

  <h3>Leitura dos materiais</h3>
  {!visible(courses,ficha.member.role).length?<p>Nenhum material disponível para este cargo.</p>:<div className="table-scroll"><table><thead><tr><th>Material</th><th>Progresso</th><th>Tempo de leitura</th><th>Último acesso</th></tr></thead><tbody>{visible(courses,ficha.member.role).map(c=>{const r=ficha.reading.find((x:any)=>x.course===c.id),p=Math.min(100,Math.round(100*(r?.done||0)/c.pages));return <tr key={c.id}><td>{c.title}<small className="muted-block">{KIND[c.kind]}</small></td><td><div className="mini-progress"><div className="progress" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}><i style={{width:p+'%'}}/></div><span className={p===100?'ok':''}>{p}% · {r?.done||0}/{c.pages} pág.</span></div></td><td>{r?minutes(r.seconds):'—'}</td><td>{date(r?.last)}</td></tr>})}</tbody></table></div>}

  <h3>Provas e alertas de integridade</h3>
  <p className="muted">Durante a prova online, o site registra quando o aluno copia, recorta ou cola texto e quando sai da tela (troca de aba, minimiza ou muda de janela). Os registros são indícios para o instrutor avaliar, não uma prova automática de fraude.</p>
  {!ficha.attempts.length?<p>Nenhuma prova online realizada.</p>:ficha.attempts.map((a:any)=>{const c=courses.find(x=>x.id===a.course),status=a.submitted?(a.passed?'Aprovado':'Reprovado'):(Date.now()-a.started>900000?'Expirada':'Em andamento'),counts=a.events.reduce((o:any,e:any)=>({...o,[e.type]:(o[e.type]||0)+1}),{});
   return <details className={'attempt'+(a.events.length?' flagged':'')} key={a.id}><summary><span><b>{c?.title||'Material apagado'}</b> · {date(a.started)}</span><span className={'status-'+status.toLowerCase().replace(' ','-')}>{status}{a.submitted?` · ${a.score}%`:''}</span>{a.events.length>0?<span className="alert-badge"><AlertTriangle size={12}/>{a.events.length} alerta(s)</span>:<span className="ok">Sem alertas</span>}</summary>
    {a.events.length>0&&<><div className="event-counts">{Object.entries(counts).map(([t,n])=><span key={t}>{EVENT[t]}: <b>{n as number}</b></span>)}</div><ol className="timeline">{a.events.map((e:any,i:number)=><li key={i}><time>{new Date(e.at).toLocaleTimeString('pt-BR')}</time> {EVENT[e.type]} <small>({Math.max(0,Math.round((e.at-a.started)/1000))}s após o início)</small></li>)}</ol></>}
   </details>})}
 </section>}

 {view==='materiais'&&<>
  {!editing&&<section className="panel form"><h2><BookOpen size={23}/> Publicar material</h2><p>Publique a Bíblia Geral para alunos, uma apostila para agentes (avaliação in game) ou um curso com prova online. Informe o número exato de páginas do PDF.</p><MaterialForm busy={busy} onSubmit={f=>saveMaterial(f)}/></section>}
  {editing&&<section className="panel form"><h2><Pencil size={21}/> Editar material</h2><p>O tipo não muda. Envie um PDF novo só se quiser trocar o arquivo; o progresso de leitura é mantido. Se diminuir o número de páginas, as páginas que sobrarem saem do progresso.</p><MaterialForm busy={busy} material={editing} onCancel={()=>setEditing(null)} onSubmit={f=>saveMaterial(f,editing.id)}/></section>}
  <section className="panel form"><h2><BookOpen size={23}/> Materiais publicados <span className="count">{courses.length}</span></h2>
   {!courses.length?<p>Nenhum material publicado.</p>:<div className="table-scroll"><table><thead><tr><th>Título</th><th>Tipo</th><th>Páginas</th><th>Concluíram</th><th>Ações</th></tr></thead><tbody>{courses.map(c=>{const eligible=data.members.filter((m:any)=>visible([c],m.role).length),done=eligible.filter((m:any)=>progressOf(m.id,c)===100).length;return <tr key={c.id}><td>{c.title}</td><td>{KIND[c.kind]}</td><td>{c.pages}</td><td>{done} de {eligible.length}</td><td><div className="table-actions"><button disabled={busy} onClick={()=>openEdit(c)}><Pencil size={13}/> Editar</button><Confirm busy={busy} label="Apagar" confirm="Apagar material, leituras e provas?" onConfirm={()=>action({action:'course-delete',course:c.id})}/></div></td></tr>})}</tbody></table></div>}
  </section></>}

 {view==='cadastro'&&<div className="admin-grid"><form className="panel form" onSubmit={async e=>{e.preventDefault();const f=e.currentTarget,v=new FormData(f);if(await action({action:'member',id:v.get('id'),name:v.get('name')}))f.reset()}}><h2><Users size={23}/> Cadastrar aluno</h2><p>Somente os dois dados do personagem. Após salvar, o aluno já pode entrar com seu ID e nome in-game.</p><label>ID in-game<input name="id" required maxLength={30} placeholder="Ex.: 1024"/></label><label>Nome in-game<input name="name" required minLength={2} maxLength={100} placeholder="Nome e sobrenome do personagem"/></label><button className="button gold" disabled={busy}><Plus size={17}/> Cadastrar aluno</button></form><form className="panel form" onSubmit={async e=>{e.preventDefault();const v=new FormData(e.currentTarget);await action({action:'settings',discord:v.get('discord')})}}><h2><Settings size={23}/> Comunidade</h2><p>Convite utilizado nos botões de recrutamento do portal.</p><label>Link do Discord<input type="url" name="discord" defaultValue={discord} required/></label><button className="button outline" disabled={busy}>Salvar convite <Check size={17}/></button><div className="info-note">Apenas o administrador pode nomear e remover instrutores. Instrutores podem promover alunos aprovados a agentes e remover matrículas de alunos e agentes.</div></form></div>}

 {view==='denuncias'&&<section className="panel form"><h2><ClipboardList size={23}/> Denúncias recebidas <span className="count">{data.reports.length}</span></h2>{!data.reports.length?<p>Nenhum relato recebido.</p>:data.reports.map((r:any)=>{const files:any[]=r.attachments?JSON.parse(r.attachments):[];return <details className="report" key={r.id}><summary>{r.organization}{!!files.length&&<span className="count">{files.length} anexo(s)</span>} <span>{date(r.created)}</span></summary><p><b>Local:</b> {r.location}</p><p className="preserve">{r.details}</p>
  {!!files.length&&<div className="report-media">{files.map((a,n)=>{const src=`/api/portal?action=attachment&report=${encodeURIComponent(r.id)}&n=${n}`;return a.type.startsWith('image')?<a key={n} href={src} target="_blank" rel="noreferrer" title="Abrir em tamanho real"><img src={src} alt={a.name} loading="lazy"/></a>:<figure key={n}><video src={src} controls preload="none"/><figcaption>{a.name}</figcaption></figure>})}</div>}
  <div className="report-actions"><small>Protocolo {r.id.slice(0,8).toUpperCase()}</small><Confirm busy={busy} label="Apagar denúncia" confirm="Apagar o relato e os anexos?" onConfirm={()=>action({action:'report-delete',report:r.id})}/></div></details>})}</section>}
 </section>;
}

function MaterialForm({busy,material,onSubmit,onCancel}:{busy:boolean;material?:any;onSubmit:(f:HTMLFormElement)=>void;onCancel?:()=>void}){
 const [kind,setKind]=useState(material?.kind||'leitura');
 return <form key={material?.id||'novo'} onSubmit={e=>{e.preventDefault();onSubmit(e.currentTarget)}}>
  <div className="form-columns"><label>Título<input name="title" required minLength={3} maxLength={120} defaultValue={material?.title} placeholder="Ex.: Proteção de Dignitários"/></label>
   <label>Tipo<select name="kind" value={kind} disabled={!!material} onChange={e=>setKind(e.target.value)}><option value="biblia">Bíblia Geral · alunos</option><option value="leitura">Apostila · agentes (sem prova, avaliação in game)</option><option value="curso">Curso · agentes (prova online)</option></select></label>
   <label>Total de páginas<input type="number" name="pages" required min={1} max={500} defaultValue={material?.pages}/></label>
   <label>Nota mínima (%)<input type="number" name="pass" required min={1} max={100} defaultValue={material?.pass??70} disabled={kind!=='curso'}/></label></div>
  {kind!=='curso'&&<input type="hidden" name="pass" value={material?.pass??70}/>}
  <label>{material?'Novo PDF (opcional) · até 20 MB':'Apostila em PDF · até 20 MB'}<input type="file" name="file" accept="application/pdf" required={!material}/></label>
  {kind==='curso'&&<><label>Questões da prova (JSON)<textarea name="questions" rows={6} defaultValue={material?.questions||'[]'} required spellCheck={false}/></label><details><summary>Como cadastrar as questões</summary><p>Use uma lista de questões, cada uma com quatro alternativas. O campo answer indica a alternativa correta: 0, 1, 2 ou 3.</p><pre>{JSON.stringify([{text:'Qual procedimento consta na apostila?',options:['Alternativa A','Alternativa B','Alternativa C','Alternativa D'],answer:0}],null,2)}</pre></details></>}
  <div className="modal-actions">{onCancel&&<button type="button" className="button outline" onClick={onCancel}><X size={16}/> Cancelar</button>}<button className="button gold" disabled={busy}>{material?<><Check size={17}/> Salvar alterações</>:<><Plus size={17}/> Publicar na academia</>}</button></div>
 </form>;
}
