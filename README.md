# Portal da Polícia Federal — RIO RP

Portal de roleplay com página pública, denúncias anônimas, academia (Bíblia Geral, cursos, provas, certificados) e painel de instrutores. Projeto fictício, sem vínculo com a Polícia Federal real.

Versão base para hospedagem na **Netlify**:

| Parte | Tecnologia |
|---|---|
| Site | Vite + React (`src/`) → pasta `dist/` |
| API | Netlify Function `netlify/functions/portal.mts` em `/api/portal` (lógica em `server/handler.ts`) |
| Banco | Netlify DB (Postgres Neon). Tabelas criadas automaticamente no primeiro acesso |
| PDFs | Netlify Blobs (store `academia`). Nada a configurar |
| Login | Alunos/agentes: ID + nome in-game · Instrutores: ID + senha · Admin: usuário `admin` + `ADMIN_PASSWORD` |

## Publicar na Netlify (via GitHub)

1. **Instale o Git** para Windows: https://git-scm.com/downloads/win
2. **Envie o código ao GitHub.** Crie um repositório vazio em https://github.com/new e, nesta pasta (`portal`), rode:
   ```bash
   git add -A
   git commit -m "Versão base para Netlify"
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
   git push -u origin main
   ```
3. **Crie o site na Netlify:** *Add new project → Import an existing project → GitHub* e escolha o repositório. As configurações de build já vêm do `netlify.toml` (comando `npm run build`, pasta `dist`), não altere nada.
4. **Defina a senha do administrador:** *Project configuration → Environment variables → Add a variable*
   - `ADMIN_PASSWORD` = uma senha forte com **pelo menos 12 caracteres** (se for mais curta, o login de admin fica desativado).
5. **Banco de dados:** a Netlify cria o Netlify DB automaticamente no deploy (o projeto usa `@netlify/neon`) e preenche `NETLIFY_DATABASE_URL`. Confira em *Extensions → Neon* no painel do site.
   - ⚠️ **Reivindique o banco (claim) na Neon dentro de 7 dias**, pelo botão *Connect Neon / Claim database* no painel, senão ele é apagado.
   - Alternativa: crie um projeto gratuito em https://neon.tech e defina a variável `DATABASE_URL` com a connection string.
6. Faça um novo deploy (*Deploys → Trigger deploy*) depois de definir as variáveis, abra o site e entre em **Academia → Acesso de instrutores** com o usuário `admin`.

A partir daí, cada `git push` na branch `main` publica uma nova versão.

## Rodar localmente

Requer Node.js 22.18 ou mais recente. Não precisa de conta Netlify nem Neon.

```bash
npm install
```

```bash
npm run dev
```

O servidor local usa um Postgres embutido (PGlite) e salva dados e PDFs em `.local-data/` (ignorado pelo git). A senha local do admin é a variável `ADMIN_PASSWORD` ou, se ausente, a senha padrão de desenvolvimento definida em `scripts/dev.mjs`.

Verificações:

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npm run build
```

## Estrutura

```
index.html, src/          Frontend (portal.tsx, globals.css)
public/brand/             Emblema
server/handler.ts         Regras da API (independente da Netlify)
server/schema.ts          Tabelas Postgres
server/passwords.ts       Hash de senhas (PBKDF2)
netlify/functions/        Adaptador Netlify (Neon + Blobs)
scripts/dev.mjs           Servidor local
tests/integration.mjs     Testes da API
```

`_legado-chatgpt-sites/` guarda localmente a versão anterior (ChatGPT Sites/Cloudflare) e não vai para o GitHub; ela continua no histórico do git.
