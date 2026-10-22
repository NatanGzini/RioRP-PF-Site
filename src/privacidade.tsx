// Política de Privacidade e Cookies (LGPD) e o aviso de cookies essenciais.
import {useState} from 'react';
import {ShieldCheck,Cookie,X} from 'lucide-react';

const UPDATED='22/10/2026';
const NOTICE_KEY='pf-cookies-aviso';

export function PrivacyPolicy({discord}:{discord:string}){
 const contact=<a className="text-link" href={discord} target="_blank" rel="noreferrer">Discord da corporação</a>;
 return <section className="inner narrow privacy">
  <h1>Privacidade e cookies</h1>
  <p className="lead">Como o portal da Polícia Federal de RIO RP trata as suas informações, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018). Última atualização: {UPDATED}.</p>

  <h2>1. Quem somos</h2>
  <p>Este portal pertence à corporação <b>fictícia</b> Polícia Federal do servidor de roleplay RIO RP e é mantido pela administração da corporação no servidor. <b>Não é um órgão público</b> nem tem vínculo com a Polícia Federal real. Para qualquer assunto sobre seus dados, fale conosco pelo {contact}.</p>

  <h2>2. Quais dados tratamos e por quê</h2>
  <div className="table-scroll"><table>
   <thead><tr><th>Dado</th><th>Para quê</th><th>Base legal (LGPD)</th></tr></thead>
   <tbody>
    <tr><td><b>Matrícula</b>: ID e nome do personagem, cargo e data de cadastro</td><td>Dar acesso à Academia conforme o cargo</td><td>Legítimo interesse e participação na corporação (art. 7º, V e IX)</td></tr>
    <tr><td><b>Senha de instrutor</b>, guardada de forma criptografada (ninguém consegue lê-la)</td><td>Proteger o acesso dos instrutores</td><td>Legítimo interesse e segurança (art. 7º, IX)</td></tr>
    <tr><td><b>Progresso de estudo</b>: páginas lidas, tempo de leitura e último acesso</td><td>Acompanhar a formação e liberar documentos e provas</td><td>Participação na corporação (art. 7º, V)</td></tr>
    <tr><td><b>Provas online</b>: respostas, nota, horários e registros de copiar, colar ou sair da tela durante a prova</td><td>Corrigir a prova e garantir que ela seja justa. Você é avisado antes de começar</td><td>Legítimo interesse (art. 7º, IX)</td></tr>
    <tr><td><b>Denúncias anônimas</b>: texto e anexos que você decide enviar</td><td>Investigações dentro do RP. Não pedimos identificação e não ligamos o relato a nenhuma conta</td><td>Legítimo interesse (art. 7º, IX)</td></tr>
    <tr><td><b>Dados técnicos</b>: o portal <b>não guarda o seu IP</b>. Para conter spam, usa um código temporário embaralhado, apagado em até 2 horas</td><td>Segurança contra abusos e ataques</td><td>Legítimo interesse e segurança (art. 7º, IX)</td></tr>
   </tbody>
  </table></div>
  <p>O portal trata dados de <b>personagens do jogo</b>. Não pedimos nome real, CPF, telefone, e-mail ou endereço. Nas denúncias, não envie dados pessoais reais seus ou de outras pessoas.</p>

  <h2>3. Cookies e armazenamento no navegador</h2>
  <div className="table-scroll"><table>
   <thead><tr><th>Nome</th><th>Tipo</th><th>Para quê</th><th>Duração</th></tr></thead>
   <tbody>
    <tr><td><code>pf_session</code></td><td>Cookie <b>essencial</b></td><td>Manter você conectado à Academia. Protegido (só o servidor lê)</td><td>7 dias para alunos e agentes, 12 horas para instrutores, ou até você sair</td></tr>
    <tr><td><code>pf-intro-vista</code></td><td>Armazenamento da sessão</td><td>Lembrar que a abertura do site já foi exibida nesta visita</td><td>Até fechar o navegador</td></tr>
    <tr><td><code>{NOTICE_KEY}</code></td><td>Armazenamento local</td><td>Lembrar que você fechou o aviso de cookies</td><td>Até você limpar os dados do navegador</td></tr>
   </tbody>
  </table></div>
  <p><b>Não usamos cookies de publicidade, de análise ou de terceiros.</b> As fontes e imagens são entregues pelo próprio portal, sem envio de dados a outras empresas. Como só há itens essenciais ao funcionamento, eles não dependem de consentimento; você pode apagá-los nas configurações do navegador, mas o login deixará de funcionar.</p>

  <h2>4. Com quem compartilhamos</h2>
  <p>Seus dados <b>não são vendidos nem compartilhados</b> com outras pessoas ou empresas. Usamos dois fornecedores que guardam os dados em nosso nome (operadores), com servidores fora do Brasil (art. 33 da LGPD):</p>
  <ul><li><b>Netlify</b>: hospedagem do portal e dos arquivos (PDFs e anexos). A Netlify mantém registros técnicos de acesso, como IP e navegador, conforme a política de privacidade dela.</li><li><b>Neon</b>: banco de dados com as matrículas, o progresso e as denúncias.</li></ul>

  <h2>5. Por quanto tempo guardamos</h2>
  <ul>
   <li><b>Matrícula, progresso e provas:</b> enquanto a matrícula estiver ativa. Ao ser removida, todo o histórico é apagado.</li>
   <li><b>Denúncias:</b> até serem apagadas pelos instrutores, ou automaticamente após <b>12 meses</b>.</li>
   <li><b>Anexos não enviados</b> (envio abandonado): apagados em 24 horas.</li>
   <li><b>Sessões de login:</b> vencem no prazo da tabela acima e são apagadas.</li>
  </ul>

  <h2>6. Segurança</h2>
  <p>Conexão criptografada (HTTPS), senhas guardadas com criptografia, acesso a cada informação restrito ao cargo, limites contra tentativas repetidas de login e proteção contra conteúdo malicioso nos anexos.</p>

  <h2>7. Seus direitos</h2>
  <p>A LGPD (art. 18) garante a você: confirmar se tratamos seus dados e <b>acessá-los</b>; <b>corrigir</b> dados errados; pedir a <b>exclusão</b>, a anonimização ou o bloqueio de dados desnecessários; a <b>portabilidade</b>; saber com quem compartilhamos; e se opor a um tratamento.</p>
  <div className="box-note"><b>Como exercer:</b> se você tem matrícula, entre na Academia e use <b>"Baixar meus dados"</b> para receber tudo o que o portal guarda sobre o seu personagem. Para corrigir ou excluir a matrícula, ou para qualquer outro pedido, fale com os instrutores ou a administração pelo {contact}. Respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</div>

  <h2>8. Mudanças nesta política</h2>
  <p>Esta política pode ser atualizada quando o portal mudar. A data da última atualização fica no topo da página.</p>
 </section>;
}

export function CookieNotice({onMore}:{onMore:()=>void}){
 const [show,setShow]=useState(()=>{try{return !localStorage.getItem(NOTICE_KEY)}catch{return true}});
 if(!show)return null;
 const close=()=>{try{localStorage.setItem(NOTICE_KEY,'1')}catch{}setShow(false)};
 return <div className="cookie-notice" role="region" aria-label="Aviso de cookies">
  <Cookie size={20} aria-hidden="true"/>
  <p>Usamos <b>apenas cookies essenciais</b>, para manter seu login. Nada de publicidade ou rastreamento. <button className="text-link" onClick={onMore}>Política de privacidade</button></p>
  <button className="button gold" onClick={close}>Entendi</button>
  <button className="cookie-close" aria-label="Fechar aviso" onClick={close}><X size={16}/></button>
 </div>;
}

export function MyData({busy}:{busy:boolean}){
 const [error,setError]=useState('');
 async function download(){
  setError('');
  try{
   const r=await fetch('/api/portal?action=my-data');const d=await r.json();if(!r.ok)throw new Error(d.error);
   const url=URL.createObjectURL(new Blob([JSON.stringify(d,null,2)],{type:'application/json'}));
   const a=document.createElement('a');a.href=url;a.download=`meus-dados-pf-rio-rp-${d.matricula?.id||'conta'}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e:any){setError(e.message||'Não foi possível baixar agora.')}
 }
 return <div className="panel my-data">
  <ShieldCheck size={22}/>
  <div><b>Seus dados (LGPD)</b><p>Baixe tudo o que o portal guarda sobre o seu personagem. Para corrigir ou excluir sua matrícula, fale com um instrutor.</p>{error&&<p className="modal-error">{error}</p>}</div>
  <button className="button outline" disabled={busy} onClick={download}>Baixar meus dados</button>
 </div>;
}
