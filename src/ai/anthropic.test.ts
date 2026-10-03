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
  ToolLoopError,
} from "./model";
import { ToolInputError, type ToolDefinition } from "./tools/types";

// A tiny fake of the Messages API: records the request, returns what the
// test queued. This checks our request shape and response handling without
// an API key (it cannot prove the real API accepts the request).

type Captured = { path: string; headers: IncomingHttpHeaders; body: Record<string, unknown> };
let server: Server;
let baseURL: string;
let captured: Captured | null = null;
let allCaptured: Captured[] = [];
let nextResponse: Record<string, unknown> = {};
// When set, responses are served in order (one per request) instead of nextResponse.
let queue: Record<string, unknown>[] = [];

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
      allCaptured.push(captured);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(queue.length > 0 ? queue.shift() : nextResponse));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => server.close());
afterEach(() => {
  captured = null;
  allCaptured = [];
  queue = [];
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

// --- tools -------------------------------------------------------------------

const toolUse = (id: string, name: string, input: unknown, extra: Record<string, unknown>[] = []) =>
  message({
    content: [...extra, { type: "tool_use", id, name, input }],
    stop_reason: "tool_use",
    usage: {
      input_tokens: 100,
      output_tokens: 10,
      cache_read_input_tokens: 80,
      cache_creation_input_tokens: 0,
    },
  });

function fakeTool(name: string, run: ToolDefinition["run"]): ToolDefinition {
  return {
    name,
    description: `Fake ${name}`,
    inputSchema: { type: "object", properties: { query: { type: "string", description: "q" } } },
    run,
  };
}

test("without tools no tools are sent", async () => {
  nextResponse = message();
  await new AnthropicChatModel({ client: client() }).reply({
    system: "S",
    messages: [{ role: "user", content: "hi" }],
  });
  assert.equal(captured!.body.tools, undefined);
});

test("tools are described to the model, run on request, and the result goes back", async () => {
  const seen: unknown[] = [];
  const tool = fakeTool("get_product", async (input) => {
    seen.push(input);
    return { price: 1300 };
  });
  const thinking = { type: "thinking", thinking: "hmm", signature: "sig" };
  queue = [
    toolUse("toolu_1", "get_product", { query: "black tshirt" }, [thinking]),
    message({ content: [{ type: "text", text: "1300 taka vai" }] }),
  ];

  const out = await new AnthropicChatModel({ client: client() }).reply({
    system: "S",
    messages: [{ role: "user", content: "black tshirt dam?" }],
    tools: [tool],
  });

  assert.equal(out.text, "1300 taka vai");
  assert.deepEqual(seen, [{ query: "black tshirt" }]);
  assert.deepEqual(out.toolCalls, [
    { name: "get_product", input: { query: "black tshirt" }, output: '{"price":1300}', isError: false },
  ]);
  // Tokens are summed over both requests.
  assert.deepEqual(out.usage, { inputTokens: 220, outputTokens: 28, cacheReadTokens: 180 });

  assert.equal(allCaptured.length, 2);
  assert.deepEqual(allCaptured[0].body.tools, [
    { name: "get_product", description: "Fake get_product", input_schema: tool.inputSchema },
  ]);
  const second = allCaptured[1].body.messages as { role: string; content: unknown }[];
  assert.equal(second.length, 3);
  assert.equal(second[1].role, "assistant");
  assert.deepEqual(
    (second[1].content as { type: string }[]).map((b) => b.type),
    ["thinking", "tool_use"],
  );
  assert.deepEqual(second[2], {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: "toolu_1", content: '{"price":1300}' }],
  });
});

test("several tool requests in one turn are all answered, in order", async () => {
  queue = [
    message({
      content: [
        { type: "tool_use", id: "a", name: "t1", input: {} },
        { type: "tool_use", id: "b", name: "t2", input: {} },
      ],
      stop_reason: "tool_use",
    }),
    message({ content: [{ type: "text", text: "done" }] }),
  ];
  const out = await new AnthropicChatModel({ client: client() }).reply({
    system: "S",
    messages: [{ role: "user", content: "x" }],
    tools: [fakeTool("t1", async () => "one"), fakeTool("t2", async () => "two")],
  });
  assert.deepEqual(
    out.toolCalls.map((c) => [c.name, c.output]),
    [
      ["t1", '"one"'],
      ["t2", '"two"'],
    ],
  );
  const results = (allCaptured[1].body.messages as { content: { tool_use_id: string }[] }[])[2]
    .content;
  assert.deepEqual(
    results.map((r) => r.tool_use_id),
    ["a", "b"],
  );
});

test("bad tool input and unknown tools go back to the model as errors, not as crashes", async () => {
  queue = [
    message({
      content: [
        { type: "tool_use", id: "a", name: "strict", input: {} },
        { type: "tool_use", id: "b", name: "ghost", input: {} },
      ],
      stop_reason: "tool_use",
    }),
    message({ content: [{ type: "text", text: "kon product?" }] }),
  ];
  const out = await new AnthropicChatModel({ client: client() }).reply({
    system: "S",
    messages: [{ role: "user", content: "x" }],
    tools: [
      fakeTool("strict", async () => {
        throw new ToolInputError('"query" is required.');
      }),
    ],
  });
  assert.equal(out.text, "kon product?");
  assert.deepEqual(
    out.toolCalls.map((c) => [c.output, c.isError]),
    [
      ['"query" is required.', true],
      ['Unknown tool "ghost".', true],
    ],
  );
  const results = (allCaptured[1].body.messages as { content: Record<string, unknown>[] }[])[2]
    .content;
  assert.equal(results[0].is_error, true);
  assert.equal(results[1].is_error, true);
});

test("a tool that breaks hides the details from the model and is logged", async () => {
  queue = [
    toolUse("a", "db", {}),
    message({ content: [{ type: "text", text: "team check korbe" }] }),
  ];
  const logged: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => logged.push(args);
  try {
    const out = await new AnthropicChatModel({ client: client() }).reply({
      system: "S",
      messages: [{ role: "user", content: "x" }],
      tools: [
        fakeTool("db", async () => {
          throw new Error("connection string postgres://secret");
        }),
      ],
    });
    assert.equal(out.toolCalls[0].isError, true);
    assert.doesNotMatch(out.toolCalls[0].output, /secret/);
  } finally {
    console.error = original;
  }
  assert.equal(logged.length, 1);
});

test("a model that never stops asking for tools raises ToolLoopError", async () => {
  nextResponse = toolUse("loop", "again", {});
  await assert.rejects(
    new AnthropicChatModel({ client: client() }).reply({
      system: "S",
      messages: [{ role: "user", content: "x" }],
      tools: [fakeTool("again", async () => "ok")],
    }),
    ToolLoopError,
  );
  assert.equal(allCaptured.length, 6, "the first request plus five tool rounds");
});

test("text written beside a tool request is not part of the reply", async () => {
  queue = [
    toolUse("a", "t", {}, [{ type: "text", text: "ek minute, check kortechi" }]),
    message({ content: [{ type: "text", text: "1300 taka" }] }),
  ];
  const out = await new AnthropicChatModel({ client: client() }).reply({
    system: "S",
    messages: [{ role: "user", content: "x" }],
    tools: [fakeTool("t", async () => 1)],
  });
  assert.equal(out.text, "1300 taka");
});
