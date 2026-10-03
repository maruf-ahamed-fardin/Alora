import { migrate } from "drizzle-orm/pglite/migrator";
import { db, pg, dataDir } from "../src/db/client";

await pg.exec("CREATE EXTENSION IF NOT EXISTS vector");
await migrate(db, { migrationsFolder: "./drizzle" });
await pg.close();
console.log(`Migrations applied. Database: ${dataDir}`);
