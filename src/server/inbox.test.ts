import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { migrate } from "drizzle-orm/pglite/migrator";

const dir = mkdtempSync(path.join(tmpdir(), "alora-inbox-test-"));
process.env.DATABASE_DIR = dir;

import { closeDb, getDb } from "../db/client";
import { businesses, channels, conversations, customers, messages } from "../db/schema";
import {
  getConversationDetails,
  getInboxBusiness,
  listConversationMessages,
  listInboxConversations,
  sendAgentMessage,
  toggleAi,
  updateConversationStatus,
} from "./inbox";

let businessId: string;
let convId: string;
let custId: string;

before(async () => {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });

  [{ id: businessId }] = await getDb()
    .insert(businesses)
    .values({ slug: "demo-shop", name: "Alora Demo Shop" })
    .returning();

  const [{ id: channelId }] = await getDb()
    .insert(channels)
    .values({
      businessId,
      type: "whatsapp",
      name: "WhatsApp Support",
      externalId: "wa-100",
    })
    .returning();

  [{ id: custId }] = await getDb()
    .insert(customers)
    .values({
      businessId,
      channelId,
      externalId: "wa-cust-01",
      name: "Rahim Ahmed",
      phone: "01700000000",
    })
    .returning();

  [{ id: convId }] = await getDb()
    .insert(conversations)
    .values({
      businessId,
      customerId: custId,
      channelId,
      status: "open",
      aiEnabled: true,
    })
    .returning();

  await getDb().insert(messages).values({
    businessId,
    conversationId: convId,
    sender: "customer",
    content: "Assalamu Alaikum, apnader hoodie ache?",
  });
});

after(async () => {
  await closeDb();
  rmSync(dir, { recursive: true, force: true });
});

test("getInboxBusiness finds demo-shop", async () => {
  const b = await getInboxBusiness();
  assert.equal(b.slug, "demo-shop");
  assert.equal(b.name, "Alora Demo Shop");
});

test("listInboxConversations returns the conversation with latest message", async () => {
  const list = await listInboxConversations(businessId);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, convId);
  assert.equal(list[0].customer.name, "Rahim Ahmed");
  assert.equal(list[0].channel.type, "whatsapp");
  assert.equal(list[0].lastMessage?.content, "Assalamu Alaikum, apnader hoodie ache?");
  assert.equal(list[0].unread, true);
});

test("getConversationDetails returns full conversation & orders", async () => {
  const details = await getConversationDetails(businessId, convId);
  assert.equal(details.id, convId);
  assert.equal(details.customerName, "Rahim Ahmed");
  assert.equal(details.channelType, "whatsapp");
  assert.ok(Array.isArray(details.orders));
});

test("sendAgentMessage sends an agent message and updates thread", async () => {
  const msg = await sendAgentMessage(businessId, convId, "Wa Alaikum Assalam! Ji hoodie stock e ache.");
  assert.equal(msg.sender, "agent");
  assert.equal(msg.content, "Wa Alaikum Assalam! Ji hoodie stock e ache.");

  const thread = await listConversationMessages(businessId, convId);
  assert.equal(thread.length, 2);
  assert.equal(thread[1].sender, "agent");
});

test("toggleAi pauses AI and leaves a system note", async () => {
  const res = await toggleAi(businessId, convId, false);
  assert.equal(res.aiEnabled, false);
  assert.equal(res.status, "handoff");

  const thread = await listConversationMessages(businessId, convId);
  const lastMsg = thread[thread.length - 1];
  assert.equal(lastMsg.sender, "system");
  assert.match(lastMsg.content, /Human agent took over/);
});

test("toggleAi can resume AI and set status to open", async () => {
  const res = await toggleAi(businessId, convId, true);
  assert.equal(res.aiEnabled, true);
  assert.equal(res.status, "open");
});

test("updateConversationStatus can close a conversation", async () => {
  const res = await updateConversationStatus(businessId, convId, "closed");
  assert.equal(res.status, "closed");
  assert.equal(res.aiEnabled, false);
});
