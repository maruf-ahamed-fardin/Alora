import assert from "node:assert/strict";
import { test } from "node:test";
import { chunkText } from "./chunker";

test("a short document is one chunk", () => {
  const text = "ঢাকার ভিতরে delivery charge ৬০ টাকা। ঢাকার বাইরে ১২০ টাকা।";
  assert.deepEqual(chunkText(text), [text]);
});

test("empty or whitespace-only text gives no chunks", () => {
  assert.deepEqual(chunkText(""), []);
  assert.deepEqual(chunkText("  \n\n  "), []);
});

test("extra whitespace and line breaks inside a paragraph are collapsed", () => {
  assert.deepEqual(chunkText("one   two\nthree"), ["one two three"]);
});

test("no chunk is longer than the limit", () => {
  const sentence = "এটি একটি বাক্য যা বেশ লম্বা। ";
  const chunks = chunkText(sentence.repeat(60), 200);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.length <= 200, `chunk of ${c.length} chars`);
});

test("splits on the Bangla danda and on full stops, not in the middle of a sentence", () => {
  const chunks = chunkText("প্রথম বাক্য। দ্বিতীয় বাক্য। Third one. Fourth one.", 30);
  for (const c of chunks) assert.match(c, /[।.]$/);
});

test("a single sentence longer than the limit is cut at a space", () => {
  const long = Array.from({ length: 50 }, (_, i) => `word${i}`).join(" ");
  const chunks = chunkText(long, 80);
  assert.ok(chunks.length > 1);
  for (const c of chunks) {
    assert.ok(c.length <= 80);
    assert.doesNotMatch(c, /word\d+word/);
  }
  assert.equal(chunks.join(" "), long);
});

test("paragraphs that are already substantial start new chunks", () => {
  const p1 = "a".repeat(400);
  const p2 = "b".repeat(400);
  assert.deepEqual(chunkText(`${p1}\n\n${p2}`, 600), [p1, p2]);
});

test("no text is lost when a document is split", () => {
  const text = "এক। দুই। তিন। চার। পাঁচ। ছয়। সাত। আট।";
  const joined = chunkText(text, 12).join(" ");
  assert.equal(joined, text);
});
