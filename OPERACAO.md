# Portal da Polícia Federal — RIO RP

Aplicação de roleplay com página pública, denúncias, academia e painel de instrutores. Não representa uma instituição pública real.

## Primeira utilização

1. Abra **Academia → Acesso de instrutores** e entre com o usuário `admin` e a senha da variável de ambiente `ADMIN_PASSWORD` (mínimo 12 caracteres), configurada na Netlify.
2. Abra **Instrutores**. Cadastre o ID e o nome in-game do personagem e salve a matrícula. Nenhum código é gerado.
3. O aluno abre **Academia** e entra com o ID e o nome in-game cadastrados. Não há código nem senha no login de alunos/agentes. Maiúsculas/minúsculas e espaços extras no nome são desconsiderados.
4. Publique a Bíblia Geral com seu PDF e o número exato de páginas. Há uma única Bíblia Geral para a formação inicial.
5. Após o exame prático na cidade, um instrutor pode promover o aluno a agente. Só o administrador nomeia instrutores: na tabela de matrículas, **Nomear instrutor** pede uma senha (mínimo 8 caracteres). O instrutor entra com o próprio ID e essa senha. O administrador também pode **Redefinir senha** ou **Remover instrutor**; as duas ações encerram as sessões abertas daquele instrutor.

O cadastro e o login do personagem usam somente ID e nome in-game, conforme solicitado. Quem conhece os dois dados pode acessar aquela matrícula. A sessão usa cookie HttpOnly, validade de sete dias e revogação ao sair. O servidor não concede privilégios de instrutor por esse login. Instrutores entram com ID e senha (sessão de 12 horas). Após cinco senhas erradas seguidas, o usuário fica bloqueado por dez minutos.

## Materiais e provas

Os PDFs (até 20 MB) ficam no Netlify Blobs e só podem ser baixados por usuários matriculados autorizados. O envio é feito em partes de 3 MB por causa do limite de requisição das funções Netlify. Alunos acessam apenas a Bíblia Geral. Agentes e instrutores acessam os cursos. Os registros ficam no Postgres da Neon (variável `DATABASE_URL`).

O leitor registra pulsos a cada cinco segundos enquanto a aba está visível. O servidor acumula no máximo trinta segundos por página, rejeita intervalos longos e mantém uma página ativa por matrícula. Troque de página pelas setas do portal para registrar corretamente o progresso; a navegação interna do visualizador PDF do navegador não altera a página registrada. Este mecanismo mede permanência, não compreensão do conteúdo.

Cursos de agentes exigem questões com quatro alternativas. O gabarito não é enviado ao navegador. A nota mínima padrão sugerida é 70%, configurável ao publicar. O servidor registra o início, aplica o prazo de quinze minutos e corrige a prova. Sair ou atualizar a página não reinicia uma tentativa em andamento. Após reprovação ou expiração é possível iniciar outra tentativa. Não é possível reenviar uma prova já finalizada.

O cadastro de questões usa JSON, com exemplo no próprio painel. Os documentos de conclusão podem ser impressos ou salvos em PDF. A carteirinha de leitura não representa aprovação no exame prático; o agendamento continua sendo feito pelo instrutor na cidade.

## Denúncias e acesso

O formulário não pede identificação e não salva a identidade da conta junto ao relato. Só instrutores podem consultar os relatos. A infraestrutura pode manter logs técnicos.

## Desenvolvimento

Veja o README.md: `npm run dev` roda o portal localmente com banco embutido; `npm test`, `npm run typecheck` e `npm run build` são as verificações. As tabelas são criadas automaticamente a partir de `server/schema.ts`. Não publique identidades ou dados de teste. `ADMIN_PASSWORD` fica nas variáveis de ambiente da Netlify, nunca no código.
