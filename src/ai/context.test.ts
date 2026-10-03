import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContext } from "./context";

test("lists the matching shop information", () => {
  const out = buildContext(
    [{ content: "Delivery: ঢাকায় ৬০ টাকা।" }, { content: "Payment: bKash, COD" }],
    [],
  );
  assert.match(out, /^## Shop information\n- Delivery: ঢাকায় ৬০ টাকা।\n- Payment: bKash, COD$/);
});

test("says so when nothing matched, so the model does not guess", () => {
  const out = buildContext([], []);
  assert.match(out, /Nothing in the shop's records matched/);
  assert.doesNotMatch(out, /Examples of how/);
});

test("adds past replies as customer and team lines", () => {
  const out = buildContext(
    [{ content: "x" }],
    [{ customerMessage: "thanks", reply: "Welcome 😊" }],
  );
  assert.match(out, /## Examples of how this shop's team replies\nCustomer: thanks\nTeam: Welcome 😊/);
});
