import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";

const dir = mkdtempSync(path.join(tmpdir(), "alora-tg-test-"));
process.env.DATABASE_DIR = dir;

import { closeDb, getDb } from "../../db/client";
import {
  businesses,
  channels,
  conversations,
  customers,
  messages,
} from "../../db/schema";
import {
  parseTelegramUpdate,
  processTelegramUpdate,
  TelegramError,
} from "./telegram";
import type { ChatModel, ModelResponse } from "../../ai/model";

let businessId: string;
let tgChannelId: string;

// Fake model for fast, deterministic unit testing
class FakeTestModel implements ChatModel {
  readonly name = "fake-model";
  readonly provider = "fake";
  public calls: unknown[] = [];

  constructor(private replyText = "Ji bhai, delivery charge Dhaka te 70 taka.") {}

  async reply(): Promise<ModelResponse> {
    this.calls.push(Date.now());
    return {
      text: this.replyText,
      model: this.name,
      usage: { inputTokens: 10, outputTokens: 10, cacheReadTokens: 0 },
      toolCalls: [],
    };
  }
}

before(async () => {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });

  [{ id: businessId }] = await getDb()
    .insert(businesses)
    .values({
      slug: "demo-shop",
      name: "Alora Demo Shop",
      toneNotes: "Friendly, speaks Banglish",
    })
    .returning();

  [{ id: tgChannelId }] = await getDb()
    .insert(channels)
    .values({
      businessId,
      type: "telegram",
      name: "Telegram Bot",
      externalId: "test-bot",
      credentials: {
        botToken: "123456:FAKE_TOKEN_FOR_TESTS",
        secretToken: "my-secret-123",
      },
    })
    .returning();
});

after(async () => {
  await closeDb();
  rmSync(dir, { recursive: true, force: true });
});

test("parseTelegramUpdate extracts fields correctly", () => {
  const update = {
    update_id: 1001,
    message: {
      message_id: 42,
      from: {
        id: 998877,
        is_bot: false,
        first_name: "Tanvir",
        last_name: "Rahman",
        username: "tanvir_r",
      },
      chat: {
        id: 998877,
        type: "private",
      },
      date: 1712538000,
      text: "Delivery charge koto lagbe?",
    },
  };

  const parsed = parseTelegramUpdate(update);
  assert.ok(parsed);
  assert.equal(parsed.messageId, "42");
  assert.equal(parsed.chatId, "998877");
  assert.equal(parsed.userId, "998877");
  assert.equal(parsed.senderName, "Tanvir Rahman");
  assert.equal(parsed.username, "tanvir_r");
  assert.equal(parsed.text, "Delivery charge koto lagbe?");
  assert.equal(parsed.isCommand, false);
});

test("parseTelegramUpdate handles /start command and Bangla text", () => {
  const update = {
    update_id: 1002,
    message: {
      message_id: 43,
      from: { id: 112233, first_name: "আরিফ" },
      chat: { id: 112233, type: "private" },
      date: 1712538000,
      text: "/start",
    },
  };

  const parsed = parseTelegramUpdate(update);
  assert.ok(parsed);
  assert.equal(parsed.isCommand, true);
  assert.equal(parsed.command, "start");
  assert.equal(parsed.senderName, "আরিফ");
});

test("parseTelegramUpdate returns null for non-text updates", () => {
  assert.equal(parseTelegramUpdate(null), null);
  assert.equal(parseTelegramUpdate({}), null);
  assert.equal(parseTelegramUpdate({ update_id: 10 }), null);
  assert.equal(
    parseTelegramUpdate({
      update_id: 10,
      message: { message_id: 1, chat: { id: 1 } },
    }),
    null,
  );
});

test("processTelegramUpdate rejects requests with wrong secret token", async () => {
  const update = {
    update_id: 2001,
    message: {
      message_id: 50,
      from: { id: 55555, first_name: "Hacker" },
      chat: { id: 55555, type: "private" },
      date: 1712538000,
      text: "test",
    },
  };

  await assert.rejects(
    async () => {
      await processTelegramUpdate(update, "wrong-secret");
    },
    (err: unknown) => {
      assert.ok(err instanceof TelegramError);
      assert.equal(err.code, "unauthorized");
      return true;
    },
  );
});

test("processTelegramUpdate creates customer, conversation and replies with AI", async () => {
  const sentMessages: { token: string; chatId: string; text: string }[] = [];
  const fakeModel = new FakeTestModel("Ji bhai! Delivery charge 70 taka.");

  const update = {
    update_id: 3001,
    message: {
      message_id: 101,
      from: {
        id: 777111,
        first_name: "Nusrat",
        last_name: "Jahan",
        username: "nusrat_j",
      },
      chat: { id: 777111, type: "private" },
      date: 1712538000,
      text: "Delivery charge koto?",
    },
  };

  const result = await processTelegramUpdate(update, "my-secret-123", {
    customModel: fakeModel,
    sendReply: async (token, chatId, text) => {
      sentMessages.push({ token, chatId, text });
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.status, "success");
  assert.ok(result.conversationId);
  assert.ok(result.customerId);
  assert.ok((result.repliesCount ?? 0) >= 1);

  // Check customer was created
  const [cust] = await getDb()
    .select()
    .from(customers)
    .where(eq(customers.id, result.customerId!));
  assert.ok(cust);
  assert.equal(cust.name, "Nusrat Jahan");
  assert.equal(cust.externalId, "777111");

  // Check conversation was created
  const [conv] = await getDb()
    .select()
    .from(conversations)
    .where(eq(conversations.id, result.conversationId!));
  assert.ok(conv);
  assert.equal(conv.status, "open");
  assert.equal(conv.aiEnabled, true);

  // Check outgoing reply was dispatched
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].chatId, "777111");
  assert.equal(sentMessages[0].text, "Ji bhai! Delivery charge 70 taka.");

  // Check message history in DB
  const thread = await getDb()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, result.conversationId!));
  assert.equal(thread.length, 2); // 1 customer + 1 ai
  assert.equal(thread[0].sender, "customer");
  assert.equal(thread[1].sender, "ai");
});

test("processTelegramUpdate ignores duplicate updates (idempotency)", async () => {
  const fakeModel = new FakeTestModel();
  const update = {
    update_id: 3001,
    message: {
      message_id: 101, // same message_id as previous test
      from: { id: 777111, first_name: "Nusrat" },
      chat: { id: 777111, type: "private" },
      date: 1712538000,
      text: "Delivery charge koto?",
    },
  };

  const result = await processTelegramUpdate(update, "my-secret-123", {
    customModel: fakeModel,
  });

  assert.equal(result.handled, true);
  assert.equal(result.status, "duplicate");
  assert.equal(result.reason, "already_processed");
  assert.equal(fakeModel.calls.length, 0); // Model was never called
});

test("processTelegramUpdate saves customer message but suppresses AI when human agent took over", async () => {
  const fakeModel = new FakeTestModel();

  // Find the conversation from earlier test and switch AI off (takeover)
  const [cust] = await getDb()
    .select()
    .from(customers)
    .where(eq(customers.externalId, "777111"));
  assert.ok(cust);

  const [conv] = await getDb()
    .select()
    .from(conversations)
    .where(eq(conversations.customerId, cust.id));
  assert.ok(conv);

  await getDb()
    .update(conversations)
    .set({ aiEnabled: false, status: "handoff" })
    .where(eq(conversations.id, conv.id));

  // Customer sends new message
  const update = {
    update_id: 3002,
    message: {
      message_id: 102,
      from: { id: 777111, first_name: "Nusrat" },
      chat: { id: 777111, type: "private" },
      date: 1712538100,
      text: "Bhaiya ami human agent er sathe kotha bolte chai.",
    },
  };

  const result = await processTelegramUpdate(update, "my-secret-123", {
    customModel: fakeModel,
  });

  assert.equal(result.handled, true);
  assert.equal(result.status, "handoff");
  assert.equal(result.reason, "human_agent_active");
  assert.equal(fakeModel.calls.length, 0); // AI must not reply

  // Message should still be in database so human agent sees it in /inbox!
  const [saved] = await getDb()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conv.id),
        eq(messages.externalId, "102"),
      ),
    );
  assert.ok(saved);
  assert.equal(saved.content, "Bhaiya ami human agent er sathe kotha bolte chai.");
  assert.equal(saved.sender, "customer");
});
