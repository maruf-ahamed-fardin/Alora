import assert from "node:assert/strict";
import { test } from "node:test";
import { splitIntoBubbles } from "./bubbles";

test("one message stays one bubble", () => {
  assert.deepEqual(splitIntoBubbles("জি ভাই 😊 কোন size লাগবে?"), [
    "জি ভাই 😊 কোন size লাগবে?",
  ]);
});

test("a line with only --- splits into bubbles", () => {
  assert.deepEqual(splitIntoBubbles("ji vai\n---\nkon size lagbe?"), [
    "ji vai",
    "kon size lagbe?",
  ]);
});

test("--- inside a sentence does not split", () => {
  assert.deepEqual(splitIntoBubbles("price --- ta check kori"), [
    "price --- ta check kori",
  ]);
});

test("more than three bubbles fold into the last one", () => {
  const out = splitIntoBubbles("a\n---\nb\n---\nc\n---\nd\n---\ne");
  assert.equal(out.length, 3);
  assert.equal(out[2], "c\nd\ne");
});

test("empty and whitespace-only parts are dropped", () => {
  assert.deepEqual(splitIntoBubbles("\n---\n  \n---\nhello\n---\n"), ["hello"]);
  assert.deepEqual(splitIntoBubbles("   "), []);
});

test("stray markdown bold is removed", () => {
  assert.deepEqual(splitIntoBubbles("দাম **১৩০০ টাকা**"), ["দাম ১৩০০ টাকা"]);
});
