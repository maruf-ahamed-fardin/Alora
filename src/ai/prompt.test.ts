import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemPrompt } from "./prompt";

const shop = {
  name: "Alora Demo Shop",
  description: "ঢাকা-ভিত্তিক অনলাইন ফ্যাশন শপ।",
  toneNotes: "Friendly, short replies.",
};

test("includes the business name, description and tone notes", () => {
  const prompt = buildSystemPrompt(shop);
  assert.match(prompt, /"Alora Demo Shop"/);
  assert.match(prompt, /ঢাকা-ভিত্তিক অনলাইন ফ্যাশন শপ/);
  assert.match(prompt, /Friendly, short replies\./);
});

test("is identical on every call so it can be cached", () => {
  assert.equal(buildSystemPrompt(shop), buildSystemPrompt({ ...shop }));
});

test("has no per-request data such as a year or timestamp", () => {
  assert.doesNotMatch(buildSystemPrompt(shop), /\b20\d\d\b/);
});

test("handles a business without description or tone notes", () => {
  const prompt = buildSystemPrompt({
    name: "X",
    description: null,
    toneNotes: "   ",
  });
  assert.match(prompt, /no description provided/);
  assert.match(prompt, /be warm, polite and brief/);
});

test("forbids inventing prices, stock and policies", () => {
  const prompt = buildSystemPrompt(shop);
  assert.match(prompt, /Never state or guess any of them/);
});

test("tells the model where facts and style examples come from", () => {
  const prompt = buildSystemPrompt(shop);
  assert.match(prompt, /"Shop information" section that follows this prompt/);
  assert.match(prompt, /"Examples of how this shop's team replies" section/);
  assert.match(prompt, /never copy a fact from them/);
});
