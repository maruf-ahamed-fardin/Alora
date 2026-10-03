import { migrate } from "drizzle-orm/pglite/migrator";
import { closeDb, getDb, getPg, getDataDir } from "../src/db/client";

const db = getDb();
await getPg().exec("CREATE EXTENSION IF NOT EXISTS vector");
await migrate(db, { migrationsFolder: "./drizzle" });
await closeDb();
console.log(`Migrations applied. Database: ${getDataDir()}`);
