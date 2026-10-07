import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { OllamaChatModel } from "./ollama";
import { EmptyReplyError, OllamaConnectionError, ToolLoopError } from "./model";
import type { ToolDefinition } from "./tools/types";

let server: Server;
let baseURL: string;
let nextResponse: Record<string, unknown> = {};

before(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(nextResponse));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("OllamaChatModel replies with generated text and usage", async () => {
  nextResponse = {
    model: "qwen2.5:7b",
    message: { role: "assistant", content: "Ji bhai, black t-shirt ache!" },
    prompt_eval_count: 50,
    eval_count: 15,
  };

  const model = new OllamaChatModel({ baseUrl: baseURL });
  const res = await model.reply({
    system: "You are a helpful shop assistant.",
    messages: [{ role: "user", content: "vai black tshirt ache?" }],
  });

  assert.equal(res.text, "Ji bhai, black t-shirt ache!");
  assert.equal(res.usage.inputTokens, 50);
  assert.equal(res.usage.outputTokens, 15);
  assert.equal(res.toolCalls.length, 0);
});

test("OllamaChatModel runs tool calls in a loop", async () => {
  let calls = 0;
  server.removeAllListeners("request");
  server.on("request", (req, res) => {
    calls++;
    res.setHeader("content-type", "application/json");
    if (calls === 1) {
      res.end(
        JSON.stringify({
          model: "qwen2.5:7b",
          message: {
            role: "assistant",
            content: "",
            tool_calls: [
              {
                function: {
                  name: "check_stock",
                  arguments: { product: "black tshirt" },
                },
              },
            ],
          },
        }),
      );
    } else {
      res.end(
        JSON.stringify({
          model: "qwen2.5:7b",
          message: { role: "assistant", content: "In stock ache!" },
        }),
      );
    }
  });

  const dummyTool: ToolDefinition = {
    name: "check_stock",
    description: "Check stock",
    inputSchema: {
      type: "object",
      properties: { product: { type: "string", description: "Product name" } },
    },
    run: async () => ({ inStock: true }),
  };

  const model = new OllamaChatModel({ baseUrl: baseURL });
  const res = await model.reply({
    system: "You are a helpful assistant.",
    messages: [{ role: "user", content: "stock ache?" }],
    tools: [dummyTool],
  });

  assert.equal(res.text, "In stock ache!");
  assert.equal(res.toolCalls.length, 1);
  assert.equal(res.toolCalls[0].name, "check_stock");
});

test("OllamaChatModel throws OllamaConnectionError when server is not reachable", async () => {
  // port 1 is unlikely to have any listener
  const deadModel = new OllamaChatModel({ baseUrl: "http://127.0.0.1:1", timeoutMs: 1000 });
  await assert.rejects(
    () => deadModel.reply({ system: "test", messages: [{ role: "user", content: "hi" }] }),
    OllamaConnectionError,
  );
});
