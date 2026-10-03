import { rm } from "node:fs/promises";
import { getDataDir } from "../src/db/client";

const dataDir = getDataDir();
await rm(dataDir, { recursive: true, force: true });
console.log(`Local database deleted: ${dataDir}`);
