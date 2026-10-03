import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";

// Local development runs on PGlite: real PostgreSQL compiled to WASM, stored
// in a folder, no install needed. PGlite allows one process at a time, so stop
// `npm run dev` before running the db:* scripts. Production (D9) switches to a
// hosted PostgreSQL; the schema is plain Postgres + pgvector and moves as is.

const dataDir = path.resolve(
  process.cwd(),
  process.env.DATABASE_DIR ?? ".data/pglite",
);

type Store = { pg: PGlite; db: ReturnType<typeof makeDb> };

function makeDb(pg: PGlite) {
  return drizzle(pg, { schema });
}

// Next.js dev reloads modules often; keep a single database handle alive.
const globalForDb = globalThis as unknown as { __aloraDb?: Store };

function open(): Store {
  // PGlite does not create missing parent folders.
  mkdirSync(dataDir, { recursive: true });
  const pg = new PGlite(dataDir, { extensions: { vector } });
  return { pg, db: makeDb(pg) };
}

const store = (globalForDb.__aloraDb ??= open());

export const pg = store.pg;
export const db = store.db;
export { dataDir };
