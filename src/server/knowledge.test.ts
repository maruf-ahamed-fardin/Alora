import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { migrate } from "drizzle-orm/pglite/migrator";

// Each test file runs in its own process; give it a throwaway database.
const dir = mkdtempSync(path.join(tmpdir(), "alora-knowledge-test-"));
process.env.DATABASE_DIR = dir;

import { closeDb, getDb } from "../db/client";
import { businesses } from "../db/schema";
import { searchKnowledge, searchToneExamples } from "../knowledge/retrieval";
import { HashEmbedder } from "../knowledge/testing";
import {
  addDocument,
  addExample,
  deleteDocument,
  deleteExample,
  listKnowledge,
  NotFoundError,
  updateDocument,
  ValidationError,
} from "./knowledge";

const embedder = new HashEmbedder();
let a: string;
let b: string;

before(async () => {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  [{ id: a }] = await getDb().insert(businesses).values({ slug: "a", name: "A" }).returning();
  [{ id: b }] = await getDb().insert(businesses).values({ slug: "b", name: "B" }).returning();
});

after(async () => {
  await closeDb();
  rmSync(dir, { recursive: true, force: true });
});

test("a new document is searchable straight away", async () => {
  await addDocument(a, { kind: "delivery", title: "Delivery", content: "delivery charge Dhaka 60 taka" }, embedder);
  const hits = await searchKnowledge(a, "delivery charge", embedder);
  assert.equal(hits[0].title, "Delivery");

  const { documents } = await listKnowledge(a);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].chunkCount, 1);
});

test("editing a document changes what is found", async () => {
  const [doc] = (await listKnowledge(a)).documents;
  await updateDocument(a, doc.id, { kind: "delivery", title: "Delivery", content: "delivery is free for everyone" }, embedder);

  const hits = await searchKnowledge(a, "free delivery", embedder);
  assert.match(hits[0].content, /free for everyone/);
  assert.equal(hits.length, 1, "old chunks are replaced, not kept");
});

test("deleting a document removes it from search", async () => {
  const [doc] = (await listKnowledge(a)).documents;
  await deleteDocument(a, doc.id);
  assert.deepEqual(await searchKnowledge(a, "delivery", embedder), []);
  assert.equal((await listKnowledge(a)).documents.length, 0);
});

test("tone examples are searchable once added and gone once deleted", async () => {
  const example = await addExample(a, { customerMessage: "thanks", reply: "Welcome 😊" }, embedder);
  assert.equal((await searchToneExamples(a, "thanks", embedder))[0].reply, "Welcome 😊");
  assert.equal((await listKnowledge(a)).examples[0].indexed, true);

  await deleteExample(a, example.id);
  assert.deepEqual(await searchToneExamples(a, "thanks", embedder), []);
});

test("bad input is rejected with a clear message", async () => {
  const ok = { kind: "faq", title: "T", content: "C" };
  await assert.rejects(addDocument(a, { ...ok, title: "  " }, embedder), ValidationError);
  await assert.rejects(addDocument(a, { ...ok, content: "x".repeat(20_001) }, embedder), /longer than/);
  await assert.rejects(addDocument(a, { ...ok, kind: "nonsense" }, embedder), /kind must be one of/);
  await assert.rejects(addExample(a, { customerMessage: "", reply: "r" }, embedder), ValidationError);
});

test("one business cannot edit or delete another's documents or examples", async () => {
  const doc = await addDocument(a, { kind: "faq", title: "Mine", content: "private" }, embedder);
  const example = await addExample(a, { customerMessage: "hi", reply: "hello" }, embedder);

  await assert.rejects(updateDocument(b, doc.id, { kind: "faq", title: "x", content: "y" }, embedder), NotFoundError);
  await assert.rejects(deleteDocument(b, doc.id), NotFoundError);
  await assert.rejects(deleteExample(b, example.id), NotFoundError);

  assert.equal((await listKnowledge(a)).documents.length, 1);
  assert.equal((await listKnowledge(b)).documents.length, 0);
});
