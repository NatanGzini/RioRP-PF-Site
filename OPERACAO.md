# Portal da Polícia Federal — RIO RP

Aplicação de roleplay com página pública, denúncias, academia e painel de instrutores. Não representa uma instituição pública real.

## Primeira utilização

1. Entre com a conta ChatGPT cujo e-mail corresponde à variável de ambiente `ADMIN_EMAIL`, configurada na hospedagem.
2. Abra **Instrutores**. Cadastre o ID e o nome in-game do personagem e entregue o código de ativação em uma conversa privada no Discord.
3. O aluno entra com a própria conta ChatGPT, abre **Academia** e informa o código. O código é de uso único. Se perdido antes da ativação, gere outro na lista de matrículas.
4. Publique a Bíblia Geral com seu PDF e o número exato de páginas. Há uma única Bíblia Geral para a formação inicial.
5. Após o exame prático na cidade, um instrutor pode promover o aluno a agente. Só o administrador nomeia instrutores.

O cadastro do personagem tem somente ID e nome in-game. A autenticação da hospedagem é separada: ID e nome não funcionam como senha.

## Materiais e provas

Os PDFs ficam no armazenamento R2 e só podem ser baixados por usuários matriculados autorizados. Alunos acessam apenas a Bíblia Geral. Agentes e instrutores acessam os cursos. Os registros ficam em D1.

O leitor registra pulsos a cada cinco segundos enquanto a aba está visível. O servidor acumula no máximo trinta segundos por página, rejeita intervalos longos e mantém uma página ativa por matrícula. Troque de página pelas setas do portal para registrar corretamente o progresso; a navegação interna do visualizador PDF do navegador não altera a página registrada. Este mecanismo mede permanência, não compreensão do conteúdo.

Cursos de agentes exigem questões com quatro alternativas. O gabarito não é enviado ao navegador. A nota mínima padrão sugerida é 70%, configurável ao publicar. O servidor registra o início, aplica o prazo de quinze minutos e corrige a prova. Sair ou atualizar a página não reinicia uma tentativa em andamento. Após reprovação ou expiração é possível iniciar outra tentativa. Não é possível reenviar uma prova já finalizada.

O cadastro de questões usa JSON, com exemplo no próprio painel. Os documentos de conclusão podem ser impressos ou salvos em PDF. A carteirinha de leitura não representa aprovação no exame prático; o agendamento continua sendo feito pelo instrutor na cidade.

## Denúncias e acesso

O formulário não pede identificação e não salva a identidade da conta junto ao relato. Só instrutores podem consultar os relatos. A infraestrutura pode manter logs técnicos. O portal é inicialmente publicado em modo privado para revisão pelo proprietário: o acesso de visitantes e demais membros depende da alteração explícita de compartilhamento na hospedagem.

## Desenvolvimento

Instale as dependências, gere migrações quando alterar o esquema e execute `npm run dev`. O login local fornecido pelo starter usa `seedy@sites.test`; ele não concede privilégios de instrutor automaticamente. Não publique identidades ou dados de teste. A configuração `ADMIN_EMAIL` é armazenada no ambiente de produção, não no código-fonte.

Verificações: `npx tsc --noEmit` e `npm run build`. Migrações versionadas em `drizzle/`; nunca reaplique as já executadas. A publicação do Sites aplica migrações na base hospedada.
