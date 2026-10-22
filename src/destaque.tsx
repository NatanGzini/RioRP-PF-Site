// Destaque da página inicial (notícia de operação) e o editor usado pelos instrutores no painel.
import {useState} from 'react';
import {Check,Megaphone} from 'lucide-react';

export type HighlightData={active:boolean;tag:string;title:string;text:string;date:string;stamp:string};

export function Highlight({h,onDenuncia}:{h:HighlightData;onDenuncia?:()=>void}){
 return <section className="highlight" aria-label="Destaque">
  <div className="hl-card">
   <div className="hl-tag"><span className="hl-urgent">Urgente</span>{h.tag&&<span>{h.tag}</span>}</div>
   <h2>{h.title}</h2>
   {h.text&&<p>{h.text}</p>}
   <div className="hl-foot"><span>{h.date?`Publicado em ${h.date}`:'Polícia Federal de RIO RP'}</span>{onDenuncia&&<button className="text-link" onClick={onDenuncia}>Enviar informação anônima</button>}</div>
   {h.stamp&&<div className="hl-stamp" aria-hidden="true">{h.stamp}</div>}
  </div>
 </section>;
}

export function HighlightEditor({current,busy,action}:{current:HighlightData;busy:boolean;action:(body:any)=>Promise<any>}){
 const [h,setH]=useState<HighlightData>(current);
 const field=(k:keyof HighlightData)=>({value:h[k] as string,onChange:(e:any)=>setH({...h,[k]:e.target.value})});
 return <section className="panel form">
  <h2><Megaphone size={23}/> Destaque da página inicial</h2>
  <p>Notícia que aparece logo abaixo da abertura do site, para todos os visitantes. Mudar o destaque não exige publicar o site de novo.</p>
  <form onSubmit={e=>{e.preventDefault();action({action:'highlight',...h})}}>
   <label className="radio"><input type="checkbox" checked={h.active} onChange={e=>setH({...h,active:e.target.checked})}/>Mostrar o destaque na página inicial</label>
   <div className="form-columns"><label>Etiqueta<input maxLength={40} placeholder="Ex.: Operação Traíra" {...field('tag')}/></label><label>Manchete<input required minLength={3} maxLength={80} placeholder="Ex.: PF prende Andrex" {...field('title')}/></label><label>Data<input maxLength={40} placeholder="Ex.: 22/10/2026" {...field('date')}/></label><label>Carimbo<input maxLength={14} placeholder="Ex.: PRESO" {...field('stamp')}/></label></div>
   <label>Texto (até 400 caracteres)<textarea rows={3} maxLength={400} {...field('text')}/></label>
   <h3>Prévia</h3>
   <div className="hl-preview">{h.title.trim().length>=3?<Highlight h={h}/>:<p>Escreva a manchete para ver a prévia.</p>}</div>
   <button className="button gold" disabled={busy}><Check size={17}/> Salvar destaque</button>
  </form>
 </section>;
}
