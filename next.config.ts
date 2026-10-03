import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite loads WASM and data files from disk; keep it out of the bundle.
  serverExternalPackages: [
    "@electric-sql/pglite",
    "@electric-sql/pglite-pgvector",
  ],
};

export default nextConfig;
