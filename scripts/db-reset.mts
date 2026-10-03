import { rm } from "node:fs/promises";
import { pg, dataDir } from "../src/db/client";

await pg.close();
await rm(dataDir, { recursive: true, force: true });
console.log(`Local database deleted: ${dataDir}`);
