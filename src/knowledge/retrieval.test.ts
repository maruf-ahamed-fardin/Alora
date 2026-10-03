import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { migrate } from "drizzle-orm/pglite/migrator";

// Each test file runs in its own process; give it a throwaway database.
const dir = mkdtempSync(path.join(tmpdir(), "alora-retrieval-test-"));
process.env.DATABASE_DIR = dir;

import { closeDb, getDb } from "../db/client";
import { businesses, knowledgeDocuments, toneExamples } from "../db/schema";
import { indexBusiness } from "./indexing";
import { searchKnowledge, searchToneExamples } from "./retrieval";
import { HashEmbedder } from "./testing";

const embedder = new HashEmbedder();
let a: string;
let b: string;

before(async () => {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  const db = getDb();
  [{ id: a }] = await db.insert(businesses).values({ slug: "a", name: "A" }).returning();
  [{ id: b }] = await db.insert(businesses).values({ slug: "b", name: "B" }).returning();

  await db.insert(knowledgeDocuments).values([
    { businessId: a, kind: "delivery", title: "Delivery", content: "delivery charge Dhaka 60 taka outside Dhaka 120 taka" },
    { businessId: a, kind: "payment", title: "Payment", content: "bkash nagad cash on delivery payment accepted" },
    { businessId: a, kind: "about", title: "Hours", content: "open saturday to thursday 10am to 10pm" },
    { businessId: b, kind: "delivery", title: "Delivery", content: "delivery is free everywhere secret-b-policy" },
  ]);
  await db.insert(toneExamples).values([
    { businessId: a, customerMessage: "delivery koto din lagbe", reply: "2-3 din lage 😊" },
    { businessId: a, customerMessage: "thanks a lot", reply: "Welcome 😊" },
    { businessId: b, customerMessage: "delivery koto din lagbe", reply: "secret-b-reply" },
  ]);
  await indexBusiness(a, embedder);
  await indexBusiness(b, embedder);
});

after(async () => {
  await closeDb();
  rmSync(dir, { recursive: true, force: true });
});

test("the best matching document comes first", async () => {
  const hits = await searchKnowledge(a, "delivery charge for Dhaka", embedder);
  assert.equal(hits[0].kind, "delivery");
  assert.match(hits[0].content, /^Delivery: /);
  assert.ok(hits[0].similarity > hits[1].similarity);
});

test("the limit is respected", async () => {
  assert.equal((await searchKnowledge(a, "delivery", embedder, 2)).length, 2);
  assert.equal((await searchKnowledge(a, "delivery", embedder, 1)).length, 1);
});

test("one business never sees another business's knowledge", async () => {
  const hits = await searchKnowledge(a, "secret-b-policy free everywhere", embedder, 10);
  assert.equal(hits.length, 3);
  assert.ok(hits.every((h) => !h.content.includes("secret-b")));
  const bHits = await searchKnowledge(b, "bkash nagad", embedder, 10);
  assert.equal(bHits.length, 1);
});

test("vectors from a different model are ignored", async () => {
  const other = new HashEmbedder();
  Object.defineProperty(other, "model", { value: "another-model" });
  assert.deepEqual(await searchKnowledge(a, "delivery", other), []);
  assert.deepEqual(await searchToneExamples(a, "delivery", other), []);
});

test("an empty question finds nothing", async () => {
  assert.deepEqual(await searchKnowledge(a, "   ", embedder), []);
  assert.deepEqual(await searchToneExamples(a, "", embedder), []);
});

test("tone examples: the most similar past message first, tenant-safe", async () => {
  const hits = await searchToneExamples(a, "delivery koto din", embedder, 5);
  assert.equal(hits[0].reply, "2-3 din lage 😊");
  assert.ok(hits.every((h) => h.reply !== "secret-b-reply"));
});
