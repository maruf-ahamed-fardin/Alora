import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, afterEach, before, test } from "node:test";
import Anthropic from "@anthropic-ai/sdk";
import { AnthropicChatModel, createChatModel } from "./anthropic";
import {
  AiNotConfiguredError,
  EmptyReplyError,
  ModelRefusedError,
} from "./model";

// A tiny fake of the Messages API: records the request, returns what the
// test queued. This checks our request shape and response handling without
// an API key (it cannot prove the real API accepts the request).

type Captured = { path: string; headers: IncomingHttpHeaders; body: Record<string, unknown> };
let server: Server;
let baseURL: string;
let captured: Captured | null = null;
let nextResponse: Record<string, unknown> = {};

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text: "  ji vai 😊  " }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 120,
      output_tokens: 18,
      cache_read_input_tokens: 100,
      cache_creation_input_tokens: 0,
    },
    ...overrides,
  };
}

before(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      captured = { path: req.url ?? "", headers: req.headers, body: JSON.parse(raw) };
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(nextResponse));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());
afterEach(() => {
  captured = null;
});

const client = () => new Anthropic({ apiKey: "test-key", baseURL, maxRetries: 0 });

test("sends the expected request and maps the response", async () => {
  nextResponse = message();
  const model = new AnthropicChatModel({ client: client() });

  const out = await model.reply({
    system: "SYSTEM",
    messages: [{ role: "user", content: "vai dam koto?" }],
  });

  assert.equal(out.text, "ji vai 😊");
  assert.deepEqual(out.usage, {
    inputTokens: 120,
    outputTokens: 18,
    cacheReadTokens: 100,
  });

  const { body, headers } = captured!;
  assert.equal(body.model, "claude-opus-5-5");
  assert.equal(body.max_tokens, 4000);
  assert.deepEqual(body.output_config, { effort: "low" });
  assert.equal(body.fallbacks, "default");
  assert.deepEqual(body.system, [
    { type: "text", text: "SYSTEM", cache_control: { type: "ephemeral" } },
  ]);
  assert.deepEqual(body.messages, [{ role: "user", content: "vai dam koto?" }]);
  assert.equal(body.thinking, undefined, "thinking must stay at the model default");
  assert.match(String(headers["anthropic-beta"]), /server-side-fallback-2026-07-01/);
});

test("per-message context is a second system block outside the cached one", async () => {
  nextResponse = message();
  const model = new AnthropicChatModel({ client: client() });

  await model.reply({
    system: "STABLE",
    context: "## Shop information\n- Delivery: 60 taka",
    messages: [{ role: "user", content: "delivery koto?" }],
  });

  assert.deepEqual(captured!.body.system, [
    { type: "text", text: "STABLE", cache_control: { type: "ephemeral" } },
    { type: "text", text: "## Shop information\n- Delivery: 60 taka" },
  ]);
});

test("Haiku gets no effort setting and no fallbacks", async () => {
  nextResponse = message({ model: "claude-haiku-4-5" });
  const model = new AnthropicChatModel({
    client: client(),
    model: "claude-haiku-4-5",
  });
  await model.reply({ system: "S", messages: [{ role: "user", content: "hi" }] });

  const { body, headers } = captured!;
  assert.equal(body.output_config, undefined);
  assert.equal(body.fallbacks, undefined);
  assert.doesNotMatch(String(headers["anthropic-beta"] ?? ""), /fallback/);
});

test("a refusal raises ModelRefusedError", async () => {
  nextResponse = message({
    content: [],
    stop_reason: "refusal",
    stop_details: { type: "refusal", category: "cyber", explanation: null },
  });
  const model = new AnthropicChatModel({ client: client() });
  await assert.rejects(
    model.reply({ system: "S", messages: [{ role: "user", content: "x" }] }),
    (err: unknown) =>
      err instanceof ModelRefusedError && err.category === "cyber",
  );
});

test("a reply with no text raises EmptyReplyError", async () => {
  nextResponse = message({
    content: [{ type: "thinking", thinking: "", signature: "sig" }],
    stop_reason: "max_tokens",
  });
  const model = new AnthropicChatModel({ client: client() });
  await assert.rejects(
    model.reply({ system: "S", messages: [{ role: "user", content: "x" }] }),
    (err: unknown) =>
      err instanceof EmptyReplyError && err.stopReason === "max_tokens",
  );
});

test("createChatModel without credentials raises AiNotConfiguredError", () => {
  const saved = {
    key: process.env.ANTHROPIC_API_KEY,
    token: process.env.ANTHROPIC_AUTH_TOKEN,
  };
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  try {
    assert.throws(() => createChatModel(), AiNotConfiguredError);
  } finally {
    if (saved.key) process.env.ANTHROPIC_API_KEY = saved.key;
    if (saved.token) process.env.ANTHROPIC_AUTH_TOKEN = saved.token;
  }
});
