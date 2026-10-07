import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";

const dir = mkdtempSync(path.join(tmpdir(), "alora-meta-test-"));
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
  parseMetaWebhook,
  processMetaMessage,
  verifyMetaSignature,
  verifyMetaWebhookSubscription,
} from "./meta";
import type { ChatModel, ModelResponse } from "../../ai/model";

let businessId: string;
let messengerChannelId: string;
let instagramChannelId: string;

// Deterministic fake model
class FakeTestModel implements ChatModel {
  readonly name = "fake-model";
  readonly provider = "fake";
  public calls: unknown[] = [];

  constructor(private replyText = "Ji apu, red t-shirt stock e ache.") {}

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
      toneNotes: "Friendly, helpful tone",
    })
    .returning();

  [{ id: messengerChannelId }] = await getDb()
    .insert(channels)
    .values({
      businessId,
      type: "messenger",
      name: "Facebook Messenger",
      externalId: "page_123456",
      credentials: {
        pageAccessToken: "FAKE_PAGE_TOKEN",
        verifyToken: "test-meta-verify",
      },
    })
    .returning();

  [{ id: instagramChannelId }] = await getDb()
    .insert(channels)
    .values({
      businessId,
      type: "instagram",
      name: "Instagram Direct",
      externalId: "ig_page_999",
      credentials: {
        pageAccessToken: "FAKE_IG_TOKEN",
        verifyToken: "test-meta-verify",
      },
    })
    .returning();
});

after(async () => {
  await closeDb();
  rmSync(dir, { recursive: true, force: true });
});

test("verifyMetaWebhookSubscription validates challenge handshake correctly", () => {
  const success = verifyMetaWebhookSubscription({
    mode: "subscribe",
    verifyToken: "test-meta-verify",
    challenge: "challenge_token_abc_123",
    expectedToken: "test-meta-verify",
  });
  assert.equal(success.valid, true);
  assert.equal(success.challenge, "challenge_token_abc_123");

  const wrongToken = verifyMetaWebhookSubscription({
    mode: "subscribe",
    verifyToken: "wrong_token",
    challenge: "challenge_token_abc_123",
    expectedToken: "test-meta-verify",
  });
  assert.equal(wrongToken.valid, false);

  const wrongMode = verifyMetaWebhookSubscription({
    mode: "unsubscribe",
    verifyToken: "test-meta-verify",
    challenge: "challenge_token_abc_123",
    expectedToken: "test-meta-verify",
  });
  assert.equal(wrongMode.valid, false);
});

test("verifyMetaSignature verifies HMAC sha256 signature", () => {
  const secret = "super_app_secret";
  const payload = JSON.stringify({ object: "page", entry: [] });
  const hmac = createHmac("sha256", secret).update(payload).digest("hex");
  const validHeader = `sha256=${hmac}`;

  assert.equal(verifyMetaSignature(payload, validHeader, secret), true);
  assert.equal(verifyMetaSignature(payload, "sha256=invalidhash", secret), false);
  assert.equal(verifyMetaSignature(payload, undefined, secret), false);
});

test("parseMetaWebhook parses Messenger and Instagram messages and skips echoes", () => {
  const webhookBody = {
    object: "page",
    entry: [
      {
        id: "page_123456",
        time: 1712538000,
        messaging: [
          {
            sender: { id: "psid_user_01" },
            recipient: { id: "page_123456" },
            timestamp: 1712538000,
            message: {
              mid: "mid.1001",
              text: "Apu t-shirt er price koto?",
            },
          },
          // Echo message should be skipped
          {
            sender: { id: "page_123456" },
            recipient: { id: "psid_user_01" },
            timestamp: 1712538001,
            message: {
              mid: "mid.1002",
              text: "Echo reply from bot",
              is_echo: true,
            },
          },
          // Delivery receipt without text should be skipped
          {
            sender: { id: "psid_user_01" },
            recipient: { id: "page_123456" },
            timestamp: 1712538002,
          },
        ],
      },
    ],
  };

  const parsed = parseMetaWebhook(webhookBody);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].platform, "messenger");
  assert.equal(parsed[0].pageId, "page_123456");
  assert.equal(parsed[0].senderId, "psid_user_01");
  assert.equal(parsed[0].messageId, "mid.1001");
  assert.equal(parsed[0].text, "Apu t-shirt er price koto?");
  assert.equal(parsed[0].isEcho, false);
});

test("parseMetaWebhook handles Instagram object type correctly", () => {
  const igWebhookBody = {
    object: "instagram",
    entry: [
      {
        id: "ig_page_999",
        time: 1712538000,
        messaging: [
          {
            sender: { id: "igsid_cust_99" },
            recipient: { id: "ig_page_999" },
            timestamp: 1712538000,
            message: {
              mid: "mid.ig.2001",
              text: "Bhaiya hoodie ache?",
            },
          },
        ],
      },
    ],
  };

  const parsed = parseMetaWebhook(igWebhookBody);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].platform, "instagram");
  assert.equal(parsed[0].senderId, "igsid_cust_99");
  assert.equal(parsed[0].messageId, "mid.ig.2001");
  assert.equal(parsed[0].text, "Bhaiya hoodie ache?");
});

test("processMetaMessage creates customer, conversation and replies with AI", async () => {
  const sentMessages: { token: string; recipientId: string; text: string }[] = [];
  const fakeModel = new FakeTestModel("Ji apu, red t-shirt 450 taka.");

  const [parsed] = parseMetaWebhook({
    object: "page",
    entry: [
      {
        id: "page_123456",
        time: 1712538000,
        messaging: [
          {
            sender: { id: "psid_cust_55" },
            recipient: { id: "page_123456" },
            timestamp: 1712538000,
            message: {
              mid: "mid.first_turn",
              text: "Red t-shirt er price koto?",
            },
          },
        ],
      },
    ],
  });

  const result = await processMetaMessage(parsed, {
    customModel: fakeModel,
    sendReply: async (token, recipientId, text) => {
      sentMessages.push({ token, recipientId, text });
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.status, "success");
  assert.ok(result.conversationId);
  assert.ok(result.customerId);
  assert.ok((result.repliesCount ?? 0) >= 1);

  // Check customer created in DB
  const [cust] = await getDb()
    .select()
    .from(customers)
    .where(eq(customers.id, result.customerId!));
  assert.ok(cust);
  assert.equal(cust.externalId, "psid_cust_55");

  // Check conversation created in DB
  const [conv] = await getDb()
    .select()
    .from(conversations)
    .where(eq(conversations.id, result.conversationId!));
  assert.ok(conv);
  assert.equal(conv.status, "open");
  assert.equal(conv.aiEnabled, true);

  // Check outgoing reply was sent
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].recipientId, "psid_cust_55");
  assert.equal(sentMessages[0].text, "Ji apu, red t-shirt 450 taka.");

  // Check thread stored in DB
  const thread = await getDb()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, result.conversationId!));
  assert.equal(thread.length, 2);
  assert.equal(thread[0].sender, "customer");
  assert.equal(thread[1].sender, "ai");
});

test("processMetaMessage is idempotent on duplicate messageId (mid)", async () => {
  const fakeModel = new FakeTestModel();
  const parsed = {
    platform: "messenger" as const,
    pageId: "page_123456",
    senderId: "psid_cust_55",
    messageId: "mid.first_turn", // duplicate mid from previous test
    text: "Red t-shirt er price koto?",
    timestamp: new Date(),
    isEcho: false,
  };

  const result = await processMetaMessage(parsed, {
    customModel: fakeModel,
  });

  assert.equal(result.handled, true);
  assert.equal(result.status, "duplicate");
  assert.equal(result.reason, "already_processed");
  assert.equal(fakeModel.calls.length, 0); // AI was not invoked
});

test("processMetaMessage saves customer message but silences AI when agent takes over", async () => {
  const fakeModel = new FakeTestModel();

  // Find existing conversation and pause AI (agent takeover)
  const [cust] = await getDb()
    .select()
    .from(customers)
    .where(eq(customers.externalId, "psid_cust_55"));
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

  // Customer messages while agent is active
  const parsed = {
    platform: "messenger" as const,
    pageId: "page_123456",
    senderId: "psid_cust_55",
    messageId: "mid.handoff_msg_01",
    text: "Amar parcel ta kalke dorkar.",
    timestamp: new Date(),
    isEcho: false,
  };

  const result = await processMetaMessage(parsed, {
    customModel: fakeModel,
  });

  assert.equal(result.handled, true);
  assert.equal(result.status, "handoff");
  assert.equal(result.reason, "human_agent_active");
  assert.equal(fakeModel.calls.length, 0); // AI stays quiet

  // Customer message is saved for the human agent
  const [saved] = await getDb()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conv.id),
        eq(messages.externalId, "mid.handoff_msg_01"),
      ),
    );
  assert.ok(saved);
  assert.equal(saved.content, "Amar parcel ta kalke dorkar.");
  assert.equal(saved.sender, "customer");
});
