// Senhas de instrutores: PBKDF2-SHA256 via WebCrypto, formato pbkdf2$iterações$sal$hash (base64).
const ITERATIONS=210000;
const encode=(s:string)=>new TextEncoder().encode(s);
const b64=(u:Uint8Array)=>btoa(String.fromCharCode(...u));
const unb64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const equal=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.reduce((d,v,i)=>d|(v^b[i]),0)===0;

async function pbkdf2(password:string,salt:Uint8Array<ArrayBuffer>,iterations:number){
 const key=await crypto.subtle.importKey('raw',encode(password),'PBKDF2',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256));
}

export async function hashPassword(password:string){
 const salt=crypto.getRandomValues(new Uint8Array(16));
 return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password,salt,ITERATIONS))}`;
}

export async function verifyPassword(password:string,stored:string){
 const [alg,iterations,salt,hash]=stored.split('$');
 if(alg!=='pbkdf2'||!salt||!hash)return false;
 return equal(await pbkdf2(password,unb64(salt),Number(iterations)),unb64(hash));
}

export const sha256Hex=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encode(s)))).map(n=>n.toString(16).padStart(2,'0')).join('');

// Comparação de tempo constante entre a senha digitada e ADMIN_PASSWORD.
export const sameSecret=async(a:string,b:string)=>(await sha256Hex('cmp:'+a))===(await sha256Hex('cmp:'+b))&&a===b;
