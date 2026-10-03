import { migrate } from "drizzle-orm/pglite/migrator";
import { closeDb, getDb, getDataDir } from "../src/db/client";

const db = getDb();
await migrate(db, { migrationsFolder: "./drizzle" });
await closeDb();
console.log(`Migrations applied. Database: ${getDataDir()}`);
