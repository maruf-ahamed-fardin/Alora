import { defineConfig } from "drizzle-kit";

// Used only to generate SQL migrations from src/db/schema.ts (no database
// connection needed). Migrations are applied by scripts/db-migrate.ts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
});
