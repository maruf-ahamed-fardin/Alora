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

export function getDataDir() {
  return path.resolve(
    /*turbopackIgnore: true*/
    process.cwd(),
    process.env.DATABASE_DIR ?? ".data/pglite",
  );
}

type Store = { pg: PGlite; db: ReturnType<typeof makeDb> };

function makeDb(pg: PGlite) {
  return drizzle(pg, { schema });
}

// Next.js dev reloads modules often; keep a single database handle alive.
const globalForDb = globalThis as unknown as { __aloraDb?: Store };

// Opened on first use, never at import time: `next build` imports route
// modules in several worker processes and they must not all open the folder.
function store(): Store {
  if (!globalForDb.__aloraDb) {
    const dir = getDataDir();
    // PGlite does not create missing parent folders.
    mkdirSync(dir, { recursive: true });
    const pg = new PGlite(dir, { extensions: { vector } });
    globalForDb.__aloraDb = { pg, db: makeDb(pg) };
  }
  return globalForDb.__aloraDb;
}

export const getDb = () => store().db;
export const getPg = () => store().pg;

export async function closeDb() {
  if (globalForDb.__aloraDb) {
    const { pg } = globalForDb.__aloraDb;
    globalForDb.__aloraDb = undefined;
    await pg.close();
  }
}
