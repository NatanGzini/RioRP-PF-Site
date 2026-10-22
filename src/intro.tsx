// Abertura do site: cortes rápidos de tipografia (estilo "match cut") que terminam no emblema da PF.
// Roda uma vez por sessão, tem botão "Pular" e não roda com "reduzir movimento" ativado.
import {useEffect,useState} from 'react';

type Frame={word:string;sub?:string;bg:'dark'|'gold'|'paper';size:number;rotate?:number;ms:number};

// size em vw (limitado pela altura da tela): todas as palavras ficam centralizadas e inteiras.
const FRAMES:Frame[]=[
 {word:'POLÍCIA',bg:'paper',size:19,ms:300},
 {word:'FEDERAL',bg:'dark',size:19,ms:260},
 {word:'Inteligência',bg:'gold',size:14,rotate:-3,ms:230},
 {word:'LEALDADE',bg:'paper',size:16,ms:200},
 {word:'JUSTIÇA',bg:'dark',size:19,ms:180},
 {word:'RIO RP',sub:'SUPERINTENDÊNCIA',bg:'gold',size:21,ms:160},
 {word:'COT',bg:'dark',size:34,ms:140},
 {word:'Operações',bg:'paper',size:17,rotate:2,ms:120},
 {word:'DISTINTIVO',bg:'dark',size:13,ms:100},
 {word:'POLÍCIA',bg:'gold',size:19,ms:85},
 {word:'FEDERAL',bg:'paper',size:19,ms:75},
 {word:'PF',bg:'dark',size:34,ms:70},
];
const LOGO_MS=1500,FADE_MS=600,KEY='pf-intro-vista';

function shouldPlay(){
 try{if(sessionStorage.getItem(KEY))return false}catch{}
 return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function Intro(){
 const [show,setShow]=useState(shouldPlay),[step,setStep]=useState(0),[leaving,setLeaving]=useState(false);
 const finish=()=>{try{sessionStorage.setItem(KEY,'1')}catch{}setLeaving(true);setTimeout(()=>setShow(false),FADE_MS)};
 useEffect(()=>{
  if(!show)return;
  new Image().src='/brand/emblema-pf.png'; // garante o emblema pronto para o quadro final
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  return()=>{document.body.style.overflow=overflow};
 },[show]);
 useEffect(()=>{
  if(!show||leaving)return;
  // step 0..FRAMES.length-1 = cortes; FRAMES.length = emblema.
  const t=step<FRAMES.length?setTimeout(()=>setStep(step+1),FRAMES[step].ms):setTimeout(finish,LOGO_MS);
  return()=>clearTimeout(t);
 },[step,show,leaving]);
 useEffect(()=>{
  if(!show)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape'||e.key==='Enter'||e.key===' ')finish()};
  window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
 },[show]);
 if(!show)return null;
 const f=FRAMES[step];
 return <div className={'intro'+(leaving?' intro-out':'')} role="presentation">
  {f?<div key={step} className={'intro-frame intro-'+f.bg}>
   <span className="intro-word" style={{fontSize:`min(${f.size}vw,${f.size*2}vh)`,['--r' as any]:(f.rotate||0)+'deg'}}>{f.word}</span>
   {f.sub&&<span className="intro-sub" style={{top:`calc(50% + min(${f.size*0.55}vw,${f.size*1.1}vh))`}}>{f.sub}</span>}
   <span className="intro-grain"/>
  </div>:<div className="intro-frame intro-dark intro-logo">
   <img src="/brand/emblema-pf.png" alt="" width="451" height="566"/>
   <div className="intro-title">POLÍCIA FEDERAL</div>
   <div className="intro-line"/>
   <div className="intro-tagline">SUPERINTENDÊNCIA · RIO RP</div>
   <span className="intro-grain"/>
  </div>}
  <button className="intro-skip" onClick={finish}>Pular</button>
 </div>;
}
