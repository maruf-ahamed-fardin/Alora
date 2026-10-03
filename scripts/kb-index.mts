import { closeDb, getDb } from "../src/db/client";
import { businesses } from "../src/db/schema";
import { createEmbedder } from "../src/knowledge/embedder";
import { indexBusiness } from "../src/knowledge/indexing";

// Builds the search index for every business. Run after seeding or after
// editing knowledge outside the app. The first run downloads the model (~120 MB).

const embedder = createEmbedder();
const all = await getDb().select().from(businesses);

for (const business of all) {
  const { documents, chunks, examples } = await indexBusiness(business.id, embedder);
  console.log(
    `${business.slug}: ${documents} documents -> ${chunks} chunks, ${examples} tone examples embedded (${embedder.model})`,
  );
}
await closeDb();
