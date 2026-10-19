import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title:'Polícia Federal | RIO RP', icons:{icon:'/brand/emblema-pf.png'}, description:'Portal da Polícia Federal de RIO RP. Recrutamento, academia e denúncias dentro do roleplay.' };
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}</body></html>}
