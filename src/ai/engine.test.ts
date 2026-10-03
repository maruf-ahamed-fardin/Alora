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
import { businesses, channels, conversations, customers, messages } from "../db/schema";
import { ConversationNotFoundError, handleCustomerMessage } from "./engine";
import type { ChatModel, ModelRequest } from "./model";

class FakeModel implements ChatModel {
  calls: ModelRequest[] = [];
  constructor(private answers: (string | Error)[]) {}
  async reply(request: ModelRequest) {
    this.calls.push(structuredClone(request));
    const next = this.answers.shift() ?? "ok";
    if (next instanceof Error) throw next;
    return {
      text: next,
      model: "fake-model",
      usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0 },
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
