import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";

// Each test file runs in its own process; give it a throwaway database.
const dir = mkdtempSync(path.join(tmpdir(), "alora-indexing-test-"));
process.env.DATABASE_DIR = dir;

import { closeDb, getDb } from "../db/client";
import { businesses, knowledgeChunks, knowledgeDocuments, toneExamples } from "../db/schema";
import {
  DocumentNotFoundError,
  indexBusiness,
  indexDocument,
  indexToneExamples,
} from "./indexing";
import { HashEmbedder } from "./testing";

let a: string;
let b: string;
let deliveryDoc: string;

before(async () => {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  const db = getDb();
  [{ id: a }] = await db.insert(businesses).values({ slug: "a", name: "A" }).returning();
  [{ id: b }] = await db.insert(businesses).values({ slug: "b", name: "B" }).returning();
  [{ id: deliveryDoc }] = await db
    .insert(knowledgeDocuments)
    .values({
      businessId: a,
      kind: "delivery",
      title: "Delivery",
      content: "ঢাকার ভিতরে delivery charge ৬০ টাকা।",
    })
    .returning();
  await db.insert(knowledgeDocuments).values({
    businessId: b,
    title: "Hours",
    content: "Open 10am to 10pm.",
  });
  await db.insert(toneExamples).values([
    { businessId: a, customerMessage: "hi", reply: "Hello 😊" },
    { businessId: a, customerMessage: "thanks", reply: "Welcome 😊" },
  ]);
});

after(async () => {
  await closeDb();
  rmSync(dir, { recursive: true, force: true });
});

const chunksOf = (businessId: string) =>
  getDb().select().from(knowledgeChunks).where(eq(knowledgeChunks.businessId, businessId));

test("indexing a document stores its chunks with the title and the model name", async () => {
  const count = await indexDocument(a, deliveryDoc, new HashEmbedder());
  assert.equal(count, 1);

  const [chunk] = await chunksOf(a);
  assert.equal(chunk.content, "Delivery: ঢাকার ভিতরে delivery charge ৬০ টাকা।");
  assert.equal(chunk.embeddingModel, "hash-test");
  assert.equal(chunk.embedding.length, 384);
});

test("re-indexing replaces the chunks instead of duplicating them", async () => {
  await getDb()
    .update(knowledgeDocuments)
    .set({ content: "Dhaka 60 taka. Baire 120 taka." })
    .where(eq(knowledgeDocuments.id, deliveryDoc));

  await indexDocument(a, deliveryDoc, new HashEmbedder());
  await indexDocument(a, deliveryDoc, new HashEmbedder());

  const chunks = await chunksOf(a);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].content, "Delivery: Dhaka 60 taka. Baire 120 taka.");
});

test("if the embedder fails the existing chunks are kept", async () => {
  const broken = new HashEmbedder();
  broken.embedPassages = async () => {
    throw new Error("model down");
  };
  await assert.rejects(indexDocument(a, deliveryDoc, broken), /model down/);
  assert.equal((await chunksOf(a)).length, 1);
});

test("another business cannot index this business's document", async () => {
  await assert.rejects(
    indexDocument(b, deliveryDoc, new HashEmbedder()),
    DocumentNotFoundError,
  );
  assert.equal((await chunksOf(b)).length, 0);
});

test("tone examples are embedded once and not again unless the model changes", async () => {
  const embedder = new HashEmbedder();
  assert.equal(await indexToneExamples(a, embedder), 2);
  assert.equal(await indexToneExamples(a, embedder), 0);

  const other = new HashEmbedder();
  Object.defineProperty(other, "model", { value: "another-model" });
  assert.equal(await indexToneExamples(a, other), 2);
});

test("indexBusiness reports what it indexed and leaves other businesses alone", async () => {
  const result = await indexBusiness(a, new HashEmbedder());
  assert.deepEqual(result, { documents: 1, chunks: 1, examples: 2 });
  assert.equal((await chunksOf(b)).length, 0);
});
