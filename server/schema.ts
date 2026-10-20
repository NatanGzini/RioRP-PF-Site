// Esquema Postgres, criado automaticamente no primeiro acesso (IF NOT EXISTS: seguro repetir).
// Cada instrução é executada separadamente (o driver HTTP do Neon não aceita vários comandos de uma vez).
// Datas são milissegundos (Date.now()) em double precision para chegarem ao JavaScript como número.
// Para mudar tabelas no futuro, acrescente instruções novas no fim (ex.: ALTER TABLE ... ADD COLUMN IF NOT EXISTS).
export const SCHEMA=[
 `CREATE TABLE IF NOT EXISTS members(id text PRIMARY KEY,name text NOT NULL,role text NOT NULL,password text,created double precision NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS courses(id text PRIMARY KEY,title text NOT NULL,kind text NOT NULL,pages integer NOT NULL,file text NOT NULL,questions text NOT NULL,pass integer NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS reading(id text PRIMARY KEY,member text NOT NULL,course text NOT NULL,page integer NOT NULL,started double precision NOT NULL,last double precision NOT NULL,seconds integer NOT NULL,done integer NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS attempts(id text PRIMARY KEY,member text NOT NULL,course text NOT NULL,started double precision NOT NULL,submitted double precision,score integer,passed integer NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS reports(id text PRIMARY KEY,organization text NOT NULL,location text NOT NULL,details text NOT NULL,created double precision NOT NULL)`,
 `CREATE TABLE IF NOT EXISTS settings(key text PRIMARY KEY,value text NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS reading_member ON reading(member,course)`,
 `CREATE INDEX IF NOT EXISTS attempts_member ON attempts(member,course)`,
 // Registro de integridade da prova: copiar, recortar, colar e saídas da tela, por tentativa.
 `CREATE TABLE IF NOT EXISTS exam_events(id text PRIMARY KEY,attempt text NOT NULL,member text NOT NULL,course text NOT NULL,type text NOT NULL,at double precision NOT NULL)`,
 `CREATE INDEX IF NOT EXISTS exam_events_attempt ON exam_events(attempt)`,
];
