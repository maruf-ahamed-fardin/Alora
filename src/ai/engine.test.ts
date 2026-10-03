import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";

// Each test file runs in its own process; give it a throwaway database.
const dir = mkdtempSync(path.join(tmpdir(), "alora-engine-test-"));
process.env.DATABASE_DIR = dir;

import { closeDb, getDb } from "../db/client";
import {
  businesses,
  channels,
  conversations,
  customers,
  knowledgeDocuments,
  messages,
  orders,
  toneExamples,
} from "../db/schema";
import { indexBusiness } from "../knowledge/indexing";
import { HashEmbedder } from "../knowledge/testing";
import {
  ConversationNotFoundError,
  handleCustomerMessage,
  retrievalQuery,
} from "./engine";
import type { ChatModel, ModelRequest, ToolCall } from "./model";

class FakeModel implements ChatModel {
  calls: ModelRequest[] = [];
  toolNames: (string[] | undefined)[] = [];
  constructor(private answers: (string | Error)[]) {}
  async reply(request: ModelRequest) {
    // Tools hold functions, which cannot be cloned; tests of them live elsewhere.
    this.calls.push(structuredClone({ ...request, tools: undefined }));
    this.toolNames.push(request.tools?.map((t) => t.name));
    const next = this.answers.shift() ?? "ok";
    if (next instanceof Error) throw next;
    return {
      text: next,
      model: "fake-model",
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 },
      toolCalls: [],
    };
  }
}

let businessId: string;
let channelId: string;
let customerId: string;

before(async () => {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  const db = getDb();
  const [business] = await db
    .insert(businesses)
    .values({ slug: "t", name: "Test Shop", toneNotes: "short" })
    .returning();
  const [channel] = await db
    .insert(channels)
    .values({ businessId: business.id, type: "playground", name: "p" })
    .returning();
  const [customer] = await db
    .insert(customers)
    .values({ businessId: business.id, channelId: channel.id, externalId: "c1" })
    .returning();
  businessId = business.id;
  channelId = channel.id;
  customerId = customer.id;
});

after(async () => {
  await closeDb();
  rmSync(dir, { recursive: true, force: true });
});

async function newConversation(aiEnabled = true) {
  const [conv] = await getDb()
    .insert(conversations)
    .values({ businessId, channelId, customerId, aiEnabled })
    .returning();
  return conv.id;
}

async function thread(conversationId: string) {
  const rows = await getDb()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId));
  return rows
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((m) => `${m.sender}: ${m.content}`);
}

test("saves the customer message and the reply, and sends the system prompt", async () => {
  const conversationId = await newConversation();
  const model = new FakeModel(["ji vai 😊"]);

  const out = await handleCustomerMessage({
    businessId,
    conversationId,
    text: "vai ache?",
    model,
  });

  assert.deepEqual(out.replies.map((r) => r.content), ["ji vai 😊"]);
  assert.equal(out.model, "fake-model");
  assert.deepEqual(await thread(conversationId), [
    "customer: vai ache?",
    "ai: ji vai 😊",
  ]);
  assert.match(model.calls[0].system, /"Test Shop"/);
  assert.deepEqual(model.calls[0].messages, [{ role: "user", content: "vai ache?" }]);
});

test("remembers earlier turns", async () => {
  const conversationId = await newConversation();
  const model = new FakeModel(["kon size?", "ok"]);

  await handleCustomerMessage({ businessId, conversationId, text: "black tshirt", model });
  await new Promise((r) => setTimeout(r, 5));
  await handleCustomerMessage({ businessId, conversationId, text: "L", model });

  assert.deepEqual(model.calls[1].messages, [
    { role: "user", content: "black tshirt" },
    { role: "assistant", content: "kon size?" },
    { role: "user", content: "L" },
  ]);
});

test("a reply with --- becomes separate bubbles saved in order", async () => {
  const conversationId = await newConversation();
  const model = new FakeModel(["ji vai\n---\nkon size lagbe?"]);

  const out = await handleCustomerMessage({
    businessId,
    conversationId,
    text: "hi",
    model,
  });

  assert.deepEqual(out.replies.map((r) => r.content), ["ji vai", "kon size lagbe?"]);
  assert.deepEqual(await thread(conversationId), [
    "customer: hi",
    "ai: ji vai",
    "ai: kon size lagbe?",
  ]);
});

test("bubbles and quick customer messages are merged into one turn each", async () => {
  const conversationId = await newConversation();
  const model = new FakeModel(["ji vai\n---\nkon size?", "ok"]);

  await handleCustomerMessage({ businessId, conversationId, text: "black tshirt", model });
  await new Promise((r) => setTimeout(r, 5));
  await handleCustomerMessage({ businessId, conversationId, text: "L", model });

  assert.deepEqual(model.calls[1].messages, [
    { role: "user", content: "black tshirt" },
    { role: "assistant", content: "ji vai\n---\nkon size?" },
    { role: "user", content: "L" },
  ]);
});

test("when AI is switched off the message is saved and the model is not called", async () => {
  const conversationId = await newConversation(false);
  const model = new FakeModel(["should not be used"]);

  const out = await handleCustomerMessage({
    businessId,
    conversationId,
    text: "manusher sathe kotha bolbo",
    model,
  });

  assert.deepEqual(out.replies, []);
  assert.equal(model.calls.length, 0);
  assert.deepEqual(await thread(conversationId), [
    "customer: manusher sathe kotha bolbo",
  ]);
});

test("if the model fails the customer message is still saved and the error is rethrown", async () => {
  const conversationId = await newConversation();
  const model = new FakeModel([new Error("boom")]);

  await assert.rejects(
    handleCustomerMessage({ businessId, conversationId, text: "hello", model }),
    /boom/,
  );
  assert.deepEqual(await thread(conversationId), ["customer: hello"]);
});

test("history is limited and always starts with the customer", async () => {
  const conversationId = await newConversation();
  const model = new FakeModel(["a1", "a2", "a3"]);
  for (const text of ["m1", "m2", "m3"]) {
    await handleCustomerMessage({ businessId, conversationId, text, model, historyLimit: 2 });
    await new Promise((r) => setTimeout(r, 5));
  }
  // limit 2 over [m1,a1,m2,a2,m3] would start with an assistant message
  assert.deepEqual(model.calls[2].messages, [{ role: "user", content: "m3" }]);
  assert.equal(model.calls[2].messages[0].role, "user");
});

test("another business cannot use this conversation", async () => {
  const conversationId = await newConversation();
  const [other] = await getDb()
    .insert(businesses)
    .values({ slug: "other", name: "Other" })
    .returning();
  await assert.rejects(
    handleCustomerMessage({
      businessId: other.id,
      conversationId,
      text: "hi",
      model: new FakeModel([]),
    }),
    ConversationNotFoundError,
  );
  assert.deepEqual(await thread(conversationId), []);
});

// --- shop information (RAG) -------------------------------------------------

test("retrievalQuery: a short follow-up is searched together with the message before it", () => {
  const turn = (role: "user" | "assistant", content: string) => ({ role, content });
  assert.equal(
    retrievalQuery([turn("user", "delivery charge koto hobe Dhaka te?"), turn("assistant", "ok"), turn("user", "L")]),
    "delivery charge koto hobe Dhaka te?\nL",
  );
  assert.equal(
    retrievalQuery([turn("user", "first"), turn("assistant", "ok"), turn("user", "this one is long enough to stand alone")]),
    "this one is long enough to stand alone",
  );
  assert.equal(retrievalQuery([turn("user", "hi")]), "hi");
});

test("the model gets matching shop information and style examples as context", async () => {
  const embedder = new HashEmbedder();
  const db = getDb();
  await db.insert(knowledgeDocuments).values([
    { businessId, kind: "delivery", title: "Delivery", content: "delivery charge Dhaka 60 taka outside Dhaka 120 taka" },
    { businessId, kind: "about", title: "Hours", content: "open saturday to thursday ten to ten" },
  ]);
  await db.insert(toneExamples).values({
    businessId,
    customerMessage: "delivery charge koto",
    reply: "Dhakar moddhe 60 taka 😊",
  });
  await indexBusiness(businessId, embedder);

  const conversationId = await newConversation();
  const model = new FakeModel(["60 taka vai"]);
  const out = await handleCustomerMessage({
    businessId,
    conversationId,
    text: "delivery charge koto",
    model,
    embedder,
  });

  const context = model.calls[0].context ?? "";
  assert.match(context, /## Shop information/);
  assert.match(context, /Delivery: delivery charge Dhaka 60 taka/);
  assert.match(context, /Customer: delivery charge koto\nTeam: Dhakar moddhe 60 taka 😊/);
  assert.equal(out.retrieved.knowledge[0].title, "Delivery");
  assert.equal(out.retrieved.examples[0].reply, "Dhakar moddhe 60 taka 😊");

  const [saved] = (await getDb().select().from(messages).where(eq(messages.conversationId, conversationId)))
    .filter((m) => m.sender === "ai");
  assert.deepEqual((saved.metadata as { sources: string[] }).sources.includes("Delivery"), true);
});

test("without an embedder the model gets no context", async () => {
  const conversationId = await newConversation();
  const model = new FakeModel(["ok"]);
  const out = await handleCustomerMessage({ businessId, conversationId, text: "hi", model });
  assert.equal(model.calls[0].context, undefined);
  assert.deepEqual(out.retrieved, { knowledge: [], examples: [] });
});

test("another business's knowledge never reaches the model", async () => {
  const [other] = await getDb()
    .insert(businesses)
    .values({ slug: "rival", name: "Rival" })
    .returning();
  await getDb().insert(knowledgeDocuments).values({
    businessId: other.id,
    title: "Secret",
    content: "rival secret delivery charge 1 taka",
  });
  const embedder = new HashEmbedder();
  await indexBusiness(other.id, embedder);

  const conversationId = await newConversation();
  const model = new FakeModel(["ok"]);
  await handleCustomerMessage({ businessId, conversationId, text: "rival secret delivery charge", model, embedder });
  assert.doesNotMatch(model.calls[0].context ?? "", /rival secret/);
});

test("if retrieval fails the customer still gets a reply, told nothing matched", async () => {
  const broken = new HashEmbedder();
  broken.embedQuery = async () => {
    throw new Error("embedding model down");
  };
  const conversationId = await newConversation();
  const model = new FakeModel(["ek minute vai"]);

  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => errors.push(args);
  try {
    const out = await handleCustomerMessage({ businessId, conversationId, text: "delivery koto?", model, embedder: broken });
    assert.deepEqual(out.replies.map((r) => r.content), ["ek minute vai"]);
  } finally {
    console.error = original;
  }
  assert.equal(errors.length, 1);
  assert.match(model.calls[0].context ?? "", /Nothing in the shop's records matched/);
});

// --- tools ------------------------------------------------------------------

// Stands in for Claude: calls the named tools with the given input, like the
// real adapter does, then answers.
class ToolUsingModel implements ChatModel {
  constructor(private plan: { tool: string; input: unknown }[]) {}
  async reply(request: ModelRequest) {
    const toolCalls: ToolCall[] = [];
    for (const step of this.plan) {
      const tool = request.tools?.find((t) => t.name === step.tool);
      assert.ok(tool, `engine offered tool ${step.tool}`);
      toolCalls.push({
        name: step.tool,
        input: step.input,
        output: JSON.stringify(await tool.run(step.input)),
        isError: false,
      });
    }
    return {
      text: "reply after tools",
      model: "fake-model",
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0 },
      toolCalls,
    };
  }
}

test("the model is offered the five tools by default and none when switched off", async () => {
  const model = new FakeModel(["ok", "ok"]);
  await handleCustomerMessage({ businessId, conversationId: await newConversation(), text: "hi", model });
  await handleCustomerMessage({
    businessId,
    conversationId: await newConversation(),
    text: "hi",
    model,
    useTools: false,
  });
  assert.deepEqual(model.toolNames[0], [
    "get_product",
    "check_stock",
    "get_delivery_charge",
    "get_order",
    "handoff_to_agent",
  ]);
  assert.equal(model.toolNames[1], undefined);
});

test("tool calls are returned and saved with the reply", async () => {
  const conversationId = await newConversation();
  const out = await handleCustomerMessage({
    businessId,
    conversationId,
    text: "dam koto?",
    model: new ToolUsingModel([{ tool: "get_product", input: { query: "shirt" } }]),
  });

  assert.equal(out.toolCalls.length, 1);
  assert.equal(out.toolCalls[0].name, "get_product");
  const [saved] = (await getDb().select().from(messages).where(eq(messages.conversationId, conversationId))).filter(
    (m) => m.sender === "ai",
  );
  const stored = (saved.metadata as { toolCalls: ToolCall[] }).toolCalls;
  assert.deepEqual(stored.map((c) => c.name), ["get_product"]);
});

test("the tools are tied to this conversation's customer: another customer's order is not found", async () => {
  const db = getDb();
  const [stranger] = await db
    .insert(customers)
    .values({ businessId, channelId, externalId: "stranger" })
    .returning();
  await db.insert(orders).values([
    { businessId, orderNumber: "ORD-1", customerId, subtotal: "100", total: "100" },
    { businessId, orderNumber: "ORD-2", customerId: stranger.id, subtotal: "200", total: "200" },
  ]);

  const mine = await handleCustomerMessage({
    businessId,
    conversationId: await newConversation(),
    text: "ORD-1 kothay?",
    model: new ToolUsingModel([{ tool: "get_order", input: { order_number: "ORD-1" } }]),
  });
  assert.match(mine.toolCalls[0].output, /"orderNumber":"ORD-1"/);

  const theirs = await handleCustomerMessage({
    businessId,
    conversationId: await newConversation(),
    text: "ORD-2 kothay?",
    model: new ToolUsingModel([{ tool: "get_order", input: { order_number: "ORD-2" } }]),
  });
  assert.doesNotMatch(theirs.toolCalls[0].output, /ORD-2/);
});

test("after the model hands over, the AI stays silent for the next message", async () => {
  const conversationId = await newConversation();
  const out = await handleCustomerMessage({
    businessId,
    conversationId,
    text: "refund chai, manager dekhan",
    model: new ToolUsingModel([{ tool: "handoff_to_agent", input: { reason: "wants a refund" } }]),
  });
  assert.deepEqual(out.replies.map((r) => r.content), ["reply after tools"]);

  const model = new FakeModel(["should not be used"]);
  const next = await handleCustomerMessage({ businessId, conversationId, text: "hello?", model });
  assert.deepEqual(next.replies, []);
  assert.equal(model.calls.length, 0);

  const [conversation] = await getDb().select().from(conversations).where(eq(conversations.id, conversationId));
  assert.equal(conversation.status, "handoff");
  // The team's note is stored but never shown to the model as a chat turn.
  const history = await thread(conversationId);
  assert.ok(history.some((line) => line.startsWith("system: Handed over")));
});
