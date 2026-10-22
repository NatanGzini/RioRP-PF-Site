// Formulário de denúncia anônima, com até 4 anexos (prints e vídeos) enviados em partes.
import {useRef,useState} from 'react';
import {EyeOff,Send,Paperclip,X,Image as ImageIcon,Film} from 'lucide-react';

const CHUNK_SIZE=3*1024*1024,MAX_FILES=4,MAX_SIZE=15*1024*1024; // iguais a server/handler.ts
const ACCEPT='image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm,video/quicktime';
const size=(n:number)=>n<1024*1024?`${Math.max(1,Math.round(n/1024))} KB`:`${(n/1024/1024).toFixed(1)} MB`;

export default function ReportForm({busy,setBusy,setError,setNotice,api,refresh}:{busy:boolean;setBusy:(b:boolean)=>void;setError:(s:string)=>void;setNotice:(s:string)=>void;api:(body:any)=>Promise<any>;refresh:()=>Promise<void>}){
 const [files,setFiles]=useState<File[]>([]),[progress,setProgress]=useState('');
 const picker=useRef<HTMLInputElement>(null);
 function add(list:FileList|null){
  setError('');const next=[...files];
  for(const f of Array.from(list||[])){
   if(next.length>=MAX_FILES){setError('Você pode anexar no máximo 4 arquivos.');break}
   if(!ACCEPT.split(',').includes(f.type)){setError(`"${f.name}" não é aceito. Envie imagens (PNG, JPG, GIF, WebP) ou vídeos (MP4, WebM, MOV).`);continue}
   if(f.size>MAX_SIZE){setError(`"${f.name}" tem ${size(f.size)}. Cada arquivo pode ter até 15 MB. Para vídeos maiores, corte o trecho importante.`);continue}
   next.push(f);
  }
  setFiles(next);if(picker.current)picker.current.value='';
 }
 async function submit(form:HTMLFormElement){
  const v=new FormData(form);setBusy(true);setError('');setNotice('');
  try{
   const attachments=[];
   for(const [n,file] of files.entries()){
    const upload=crypto.randomUUID(),parts=Math.max(1,Math.ceil(file.size/CHUNK_SIZE));
    for(let i=0;i<parts;i++){
     setProgress(`Enviando anexo ${n+1} de ${files.length}${parts>1?` (parte ${i+1} de ${parts})`:''}…`);
     const part=new FormData();part.set('action','report-upload');part.set('upload',upload);part.set('index',String(i));part.set('chunk',file.slice(i*CHUNK_SIZE,(i+1)*CHUNK_SIZE));
     await api(part);
    }
    attachments.push({upload,parts,name:file.name});
   }
   setProgress('Enviando relato…');
   const d=await api({action:'report',organization:v.get('organization'),location:v.get('location'),details:v.get('details'),attachments});
   setNotice(d.message);form.reset();setFiles([]);window.scrollTo({top:0});refresh();
  }catch(e:any){setError(e.message);window.scrollTo({top:0})}finally{setBusy(false);setProgress('')}
 }
 return <form className="panel form" onSubmit={e=>{e.preventDefault();submit(e.currentTarget)}}>
  <div className="form-heading"><EyeOff/><div><h2>Nova denúncia</h2><p>O relato será acessível apenas aos instrutores da corporação.</p></div></div>
  <label>Organização ou grupo<input name="organization" minLength={2} maxLength={120} required placeholder="Nome da organização envolvida"/></label>
  <label>Local da ocorrência<input name="location" minLength={2} maxLength={200} required placeholder="Bairro, ponto de referência ou região na cidade"/></label>
  <label>O que aconteceu?<textarea name="details" aria-describedby="details-help" minLength={30} maxLength={5000} required rows={6} placeholder="Descreva o que presenciou, o local, o horário e os envolvidos no RP. "/></label>
  <p id="details-help" className="muted">Escreva pelo menos 30 caracteres. Inclua local, horário e fatos ocorridos no RP, sem informar seus dados pessoais.</p>
  <div className="attach-box">
   <div className="attach-head"><div><b>Prints e vídeos</b> <span className="muted">Opcional. Até 4 arquivos de 15 MB cada.</span></div><button type="button" className="button outline" disabled={busy||files.length>=MAX_FILES} onClick={()=>picker.current?.click()}><Paperclip size={16}/> Anexar arquivo</button></div>
   <input ref={picker} type="file" accept={ACCEPT} multiple hidden onChange={e=>add(e.target.files)}/>
   {!!files.length&&<ul className="attach-list">{files.map((f,i)=><li key={i}>{f.type.startsWith('video')?<Film size={16}/>:<ImageIcon size={16}/>}<span>{f.name}</span><small>{size(f.size)}</small><button type="button" aria-label={'Remover '+f.name} disabled={busy} onClick={()=>setFiles(files.filter((_,j)=>j!==i))}><X size={15}/></button></li>)}</ul>}
   <p className="attach-tip"><b>Proteja seu anonimato:</b> antes de anexar, corte do print ou do vídeo o seu nome, ID, chat, celular do jogo e qualquer coisa que mostre quem você é.</p>
  </div>
  <p className="muted">Não vinculamos o relato à sua matrícula ou conta. A plataforma de hospedagem pode manter registros técnicos de acesso.</p>
  {progress&&<p className="upload-progress" role="status">{progress}</p>}
  <button className="button gold" disabled={busy}><Send size={17}/>{busy?'Enviando…':'Enviar denúncia'}</button>
 </form>;
}
