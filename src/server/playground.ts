import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  businesses,
  channels,
  conversations,
  customers,
  messages,
} from "../db/schema";

// The local test chat. It talks to the seeded demo business through its
// "playground" channel, exactly like a real channel would, so what you tune
// here is what customers will get later.

export const PLAYGROUND_BUSINESS_SLUG = "demo-shop";

export class PlaygroundNotSeededError extends Error {
  constructor() {
    super("Demo business not found. Run `npm run db:reset` (with the dev server stopped).");
    this.name = "PlaygroundNotSeededError";
  }
}

export async function getPlaygroundConversation() {
  const db = getDb();

  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, PLAYGROUND_BUSINESS_SLUG));
  if (!business) throw new PlaygroundNotSeededError();

  const [channel] = await db
    .select()
    .from(channels)
    .where(
      and(eq(channels.businessId, business.id), eq(channels.type, "playground")),
    );
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.businessId, business.id));
  if (!channel || !customer) throw new PlaygroundNotSeededError();

  const [existing] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, business.id),
        eq(conversations.customerId, customer.id),
        eq(conversations.channelId, channel.id),
      ),
    )
    .orderBy(desc(conversations.createdAt))
    .limit(1);

  const conversation =
    existing ??
    (
      await db
        .insert(conversations)
        .values({
          businessId: business.id,
          customerId: customer.id,
          channelId: channel.id,
        })
        .returning()
    )[0];

  return { business, conversation };
}

export async function listThread(businessId: string, conversationId: string) {
  return getDb()
    .select({
      id: messages.id,
      sender: messages.sender,
      content: messages.content,
      createdAt: messages.createdAt,
      metadata: messages.metadata,
    })
    .from(messages)
    .where(
      and(
        eq(messages.businessId, businessId),
        eq(messages.conversationId, conversationId),
      ),
    )
    .orderBy(asc(messages.createdAt), asc(messages.id));
}

/** Start the test chat over: deletes the conversation and its messages. */
export async function resetPlayground() {
  const { business, conversation } = await getPlaygroundConversation();
  await getDb()
    .delete(conversations)
    .where(
      and(
        eq(conversations.businessId, business.id),
        eq(conversations.id, conversation.id),
      ),
    );
}
