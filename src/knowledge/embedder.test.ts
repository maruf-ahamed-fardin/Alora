import assert from "node:assert/strict";
import { test } from "node:test";
import { EMBEDDING_DIMENSIONS } from "../db/schema";
import { LocalE5Embedder } from "./embedder";

// Loads the real model (about 120 MB, downloaded once). Off by default so
// `npm test` stays fast and offline:  RUN_MODEL_TESTS=1 npm test
const enabled = process.env.RUN_MODEL_TESTS === "1";

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

test(
  "embeddings have the size the database expects and are normalized",
  { skip: !enabled, timeout: 300_000 },
  async () => {
    const embedder = new LocalE5Embedder();
    const [v] = await embedder.embedPassages(["ঢাকার ভিতরে delivery charge ৬০ টাকা।"]);
    assert.equal(v.length, EMBEDDING_DIMENSIONS);
    assert.ok(Math.abs(Math.sqrt(dot(v, v)) - 1) < 1e-3, "vector should have length 1");
  },
);

test(
  "a Banglish question is closer to the matching Bangla policy than to an unrelated one",
  { skip: !enabled, timeout: 300_000 },
  async () => {
    const embedder = new LocalE5Embedder();
    const [delivery, hours] = await embedder.embedPassages([
      "ঢাকার ভিতরে delivery charge ৬০ টাকা, ঢাকার বাইরে ১২০ টাকা।",
      "শনিবার থেকে বৃহস্পতিবার সকাল ১০টা থেকে রাত ১০টা পর্যন্ত খোলা।",
    ]);
    const query = await embedder.embedQuery("vai delivery charge koto?");
    assert.ok(dot(query, delivery) > dot(query, hours));
  },
);

test("empty input returns no vectors without loading the model", async () => {
  assert.deepEqual(await new LocalE5Embedder().embedPassages([]), []);
});
