import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { migrate } from "drizzle-orm/pglite/migrator";
import { and, eq } from "drizzle-orm";

const dir = mkdtempSync(path.join(tmpdir(), "alora-wa-test-"));
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
  parseWhatsAppWebhook,
  processWhatsAppMessage,
  verifyWhatsAppWebhook,
} from "./whatsapp";
import type { ChatModel, ModelResponse } from "../../ai/model";

let businessId: string;
let whatsappChannelId: string;

// Deterministic fake model
class FakeTestModel implements ChatModel {
  readonly name = "fake-model";
  readonly provider = "fake";
  public calls: unknown[] = [];

  constructor(private replyText = "Ji apu, delivery charge 70 taka.") {}

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
      toneNotes: "Friendly, speaks polite Banglish",
    })
    .returning();

  [{ id: whatsappChannelId }] = await getDb()
    .insert(channels)
    .values({
      businessId,
      type: "whatsapp",
      name: "WhatsApp Official",
      externalId: "phone_id_98765",
      credentials: {
        accessToken: "FAKE_WA_ACCESS_TOKEN",
        phoneNumberId: "phone_id_98765",
        verifyToken: "test-wa-verify",
      },
    })
    .returning();
});

after(async () => {
  await closeDb();
  rmSync(dir, { recursive: true, force: true });
});

test("verifyWhatsAppWebhook validates challenge handshake correctly", () => {
  const success = verifyWhatsAppWebhook({
    mode: "subscribe",
    verifyToken: "test-wa-verify",
    challenge: "challenge_wa_secret_123",
    expectedToken: "test-wa-verify",
  });
  assert.equal(success.valid, true);
  assert.equal(success.challenge, "challenge_wa_secret_123");

  const wrongToken = verifyWhatsAppWebhook({
    mode: "subscribe",
    verifyToken: "wrong_token",
    challenge: "challenge_wa_secret_123",
    expectedToken: "test-wa-verify",
  });
  assert.equal(wrongToken.valid, false);

  const wrongMode = verifyWhatsAppWebhook({
    mode: "unsubscribe",
    verifyToken: "test-wa-verify",
    challenge: "challenge_wa_secret_123",
    expectedToken: "test-wa-verify",
  });
  assert.equal(wrongMode.valid, false);
});

test("parseWhatsAppWebhook extracts incoming messages and ignores status updates", () => {
  const webhookBody = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba_account_01",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: "phone_id_98765",
              },
              contacts: [
                {
                  profile: { name: "Nusrat Jahan" },
                  wa_id: "8801711002233",
                },
              ],
              messages: [
                {
                  from: "8801711002233",
                  id: "wamid.ABGG123456789",
                  timestamp: "1712538000",
                  type: "text",
                  text: { body: "Delivery charge koto lagbe Dhaka te?" },
                },
              ],
              statuses: [
                {
                  id: "wamid.OLD123",
                  status: "delivered",
                  timestamp: "1712538001",
                  recipient_id: "8801711002233",
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const parsed = parseWhatsAppWebhook(webhookBody);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].phoneNumberId, "phone_id_98765");
  assert.equal(parsed[0].senderPhone, "8801711002233");
  assert.equal(parsed[0].senderName, "Nusrat Jahan");
  assert.equal(parsed[0].messageId, "wamid.ABGG123456789");
  assert.equal(parsed[0].text, "Delivery charge koto lagbe Dhaka te?");
});

test("parseWhatsAppWebhook handles interactive button reply", () => {
  const webhookBody = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba_account_01",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: "phone_id_98765",
              },
              messages: [
                {
                  from: "8801811223344",
                  id: "wamid.BUTTON_01",
                  timestamp: "1712538000",
                  type: "interactive",
                  interactive: {
                    button_reply: {
                      id: "btn_cash_on_delivery",
                      title: "Cash on Delivery",
                    },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const parsed = parseWhatsAppWebhook(webhookBody);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].text, "Cash on Delivery");
  assert.equal(parsed[0].senderPhone, "8801811223344");
});

test("processWhatsAppMessage creates customer, conversation and replies via AI", async () => {
  const sentMessages: { token: string; phoneId: string; to: string; text: string }[] = [];
  const fakeModel = new FakeTestModel("Ji apu, Dhaka te delivery charge 70 taka.");

  const [parsed] = parseWhatsAppWebhook({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba_account_01",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: "phone_id_98765",
              },
              contacts: [
                {
                  profile: { name: "Nusrat Jahan" },
                  wa_id: "8801711002233",
                },
              ],
              messages: [
                {
                  from: "8801711002233",
                  id: "wamid.FIRST_MESSAGE_01",
                  timestamp: "1712538000",
                  type: "text",
                  text: { body: "Delivery charge koto?" },
                },
              ],
            },
          },
        ],
      },
    ],
  });

  const result = await processWhatsAppMessage(parsed, {
    customModel: fakeModel,
    sendReply: async (token, phoneId, to, text) => {
      sentMessages.push({ token, phoneId, to, text });
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.status, "success");
  assert.ok(result.conversationId);
  assert.ok(result.customerId);
  assert.ok((result.repliesCount ?? 0) >= 1);

  // Check customer created in DB with phone number
  const [cust] = await getDb()
    .select()
    .from(customers)
    .where(eq(customers.id, result.customerId!));
  assert.ok(cust);
  assert.equal(cust.name, "Nusrat Jahan");
  assert.equal(cust.phone, "8801711002233");
  assert.equal(cust.externalId, "8801711002233");

  // Check conversation created in DB
  const [conv] = await getDb()
    .select()
    .from(conversations)
    .where(eq(conversations.id, result.conversationId!));
  assert.ok(conv);
  assert.equal(conv.status, "open");
  assert.equal(conv.aiEnabled, true);

  // Check outgoing reply sent
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].to, "8801711002233");
  assert.equal(sentMessages[0].phoneId, "phone_id_98765");
  assert.equal(sentMessages[0].text, "Ji apu, Dhaka te delivery charge 70 taka.");

  // Check message thread in DB
  const thread = await getDb()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, result.conversationId!));
  assert.equal(thread.length, 2);
  assert.equal(thread[0].sender, "customer");
  assert.equal(thread[1].sender, "ai");
});

test("processWhatsAppMessage is idempotent on duplicate wamid", async () => {
  const fakeModel = new FakeTestModel();
  const parsed = {
    phoneNumberId: "phone_id_98765",
    senderPhone: "8801711002233",
    senderName: "Nusrat Jahan",
    messageId: "wamid.FIRST_MESSAGE_01", // duplicate wamid
    text: "Delivery charge koto?",
    timestamp: new Date(),
  };

  const result = await processWhatsAppMessage(parsed, {
    customModel: fakeModel,
  });

  assert.equal(result.handled, true);
  assert.equal(result.status, "duplicate");
  assert.equal(result.reason, "already_processed");
  assert.equal(fakeModel.calls.length, 0); // AI was not invoked
});

test("processWhatsAppMessage saves customer message but silences AI when agent takes over", async () => {
  const fakeModel = new FakeTestModel();

  // Find existing conversation and pause AI (agent takeover)
  const [cust] = await getDb()
    .select()
    .from(customers)
    .where(eq(customers.externalId, "8801711002233"));
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

  // Customer messages while human agent is active
  const parsed = {
    phoneNumberId: "phone_id_98765",
    senderPhone: "8801711002233",
    senderName: "Nusrat Jahan",
    messageId: "wamid.HANDOFF_MSG_02",
    text: "Amar parcel ta kalke dorkar urgently.",
    timestamp: new Date(),
  };

  const result = await processWhatsAppMessage(parsed, {
    customModel: fakeModel,
  });

  assert.equal(result.handled, true);
  assert.equal(result.status, "handoff");
  assert.equal(result.reason, "human_agent_active");
  assert.equal(fakeModel.calls.length, 0); // AI stays quiet

  // Customer message is preserved in database for agent
  const [saved] = await getDb()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conv.id),
        eq(messages.externalId, "wamid.HANDOFF_MSG_02"),
      ),
    );
  assert.ok(saved);
  assert.equal(saved.content, "Amar parcel ta kalke dorkar urgently.");
  assert.equal(saved.sender, "customer");
});
