import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { handleCustomerMessage } from "../../ai/engine";
import { createChatModel, isAiConfigured } from "../../ai/factory";
import type { ChatModel } from "../../ai/model";
import { getDb } from "../../db/client";
import {
  businesses,
  channels,
  conversations,
  customers,
  messages,
} from "../../db/schema";
import { createEmbedder } from "../../knowledge/embedder";
import type {
  MetaCredentials,
  MetaWebhookPayload,
  ParsedMetaMessage,
} from "./types";

export class MetaError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "MetaError";
  }
}

/**
 * Validates Meta's initial webhook subscription challenge (GET request).
 * Meta sends: hub.mode, hub.verify_token, hub.challenge.
 */
export function verifyMetaWebhookSubscription(params: {
  mode?: string | null;
  verifyToken?: string | null;
  challenge?: string | null;
  expectedToken: string;
}): { valid: boolean; challenge?: string } {
  const { mode, verifyToken, challenge, expectedToken } = params;

  if (mode === "subscribe" && verifyToken && verifyToken === expectedToken) {
    return { valid: true, challenge: challenge || "" };
  }

  return { valid: false };
}

/**
 * Validates the X-Hub-Signature-256 header sent by Meta on POST webhooks.
 */
export function verifyMetaSignature(
  rawPayload: string,
  signatureHeader?: string | null,
  appSecret?: string,
): boolean {
  if (!appSecret) return true; // If no app secret configured, signature check is optional
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expectedSignature = signatureHeader.slice(7);
  const hmac = createHmac("sha256", appSecret).update(rawPayload).digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(hmac, "utf8"),
      Buffer.from(expectedSignature, "utf8"),
    );
  } catch {
    return false;
  }
}

/**
 * Parses incoming Meta webhook event payload into normalized messages.
 * Handles both Facebook Messenger and Instagram Direct messages.
 * Skips echoes, read receipts, delivery reports.
 */
export function parseMetaWebhook(body: unknown): ParsedMetaMessage[] {
  if (!body || typeof body !== "object") return [];

  const raw = body as MetaWebhookPayload;
  if (!raw.entry || !Array.isArray(raw.entry)) return [];

  const platform = raw.object === "instagram" ? "instagram" : "messenger";
  const parsedMessages: ParsedMetaMessage[] = [];

  for (const entry of raw.entry) {
    const pageId = entry.id;
    const messaging = entry.messaging || [];

    for (const event of messaging) {
      // Ignore echoes from page itself
      if (event.message?.is_echo) continue;

      const text =
        event.message?.text ||
        event.message?.quick_reply?.payload ||
        event.postback?.payload ||
        "";

      const trimmedText = text.trim();
      const messageId = event.message?.mid || `postback_${event.timestamp}`;

      if (!trimmedText || !event.sender?.id) continue;

      parsedMessages.push({
        platform,
        pageId,
        senderId: String(event.sender.id),
        messageId: String(messageId),
        text: trimmedText,
        timestamp: new Date(event.timestamp),
        isEcho: false,
      });
    }
  }

  return parsedMessages;
}

/**
 * Sends a message via Meta Graph Send API to Messenger or Instagram.
 */
export async function sendMetaMessage(options: {
  pageAccessToken: string;
  recipientId: string;
  text: string;
}): Promise<{ ok: boolean; messageId?: string; description?: string }> {
  const { pageAccessToken, recipientId, text } = options;

  if (!pageAccessToken) {
    throw new MetaError("Page access token is missing", "missing_token", 500);
  }

  const url = `https://graph.facebook.com/v21.0/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`;

  const payload = {
    recipient: { id: recipientId },
    messaging_type: "RESPONSE",
    message: { text },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as {
      recipient_id?: string;
      message_id?: string;
      error?: { message: string; code: number };
    };

    if (!res.ok || data.error) {
      console.error("Meta Send API error:", data.error);
      return {
        ok: false,
        description: data.error?.message || `HTTP ${res.status}`,
      };
    }

    return {
      ok: true,
      messageId: data.message_id,
    };
  } catch (err) {
    console.error("Network error sending Meta message:", err);
    return {
      ok: false,
      description: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Resolves the active Messenger or Instagram channel for the business.
 */
export async function getActiveMetaChannel(
  platform: "messenger" | "instagram",
  pageId?: string,
  businessSlug = "demo-shop",
) {
  const db = getDb();

  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, businessSlug));

  if (!business) {
    throw new MetaError(`Business '${businessSlug}' not found`, "business_not_found", 404);
  }

  const conditions = [
    eq(channels.businessId, business.id),
    eq(channels.type, platform),
    eq(channels.isActive, true),
  ];

  if (pageId) {
    conditions.push(eq(channels.externalId, pageId));
  }

  let [channel] = await db.select().from(channels).where(and(...conditions));

  // Fallback to first active channel of that type if specific pageId not found
  if (!channel) {
    [channel] = await db
      .select()
      .from(channels)
      .where(
        and(
          eq(channels.businessId, business.id),
          eq(channels.type, platform),
          eq(channels.isActive, true),
        ),
      );
  }

  if (!channel) {
    throw new MetaError(
      `No active ${platform} channel found for business '${businessSlug}'`,
      "channel_not_found",
      404,
    );
  }

  return { business, channel };
}

export type ProcessMetaResult = {
  handled: boolean;
  status: "success" | "duplicate" | "handoff" | "no_ai";
  conversationId?: string;
  customerId?: string;
  repliesCount?: number;
  reason?: string;
};

/**
 * Processes a single parsed message from Messenger or Instagram.
 */
export async function processMetaMessage(
  parsed: ParsedMetaMessage,
  options?: {
    businessSlug?: string;
    customModel?: ChatModel;
    sendReply?: (pageAccessToken: string, recipientId: string, text: string) => Promise<unknown>;
  },
): Promise<ProcessMetaResult> {
  const { business, channel } = await getActiveMetaChannel(
    parsed.platform,
    parsed.pageId,
    options?.businessSlug || "demo-shop",
  );

  const creds = (channel.credentials as MetaCredentials) || {};
  const pageAccessToken =
    creds.pageAccessToken ||
    (parsed.platform === "instagram"
      ? process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN
      : process.env.META_PAGE_ACCESS_TOKEN);

  const db = getDb();

  // Find or create customer
  let [customer] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.channelId, channel.id),
        eq(customers.externalId, parsed.senderId),
      ),
    );

  const defaultName = parsed.platform === "instagram" ? "Instagram Customer" : "Facebook Customer";

  if (!customer) {
    [customer] = await db
      .insert(customers)
      .values({
        businessId: business.id,
        channelId: channel.id,
        externalId: parsed.senderId,
        name: defaultName,
      })
      .returning();
  }

  // Find or create active conversation
  let [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, business.id),
        eq(conversations.customerId, customer.id),
        eq(conversations.channelId, channel.id),
      ),
    )
    .orderBy(desc(conversations.lastMessageAt));

  if (!conv || conv.status === "closed") {
    [conv] = await db
      .insert(conversations)
      .values({
        businessId: business.id,
        customerId: customer.id,
        channelId: channel.id,
        status: "open",
        aiEnabled: true,
      })
      .returning();
  }

  // Idempotency: skip already processed message ID
  const [existingMsg] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conv.id),
        eq(messages.externalId, parsed.messageId),
      ),
    );

  if (existingMsg) {
    return {
      handled: true,
      status: "duplicate",
      conversationId: conv.id,
      customerId: customer.id,
      reason: "already_processed",
    };
  }

  // If agent takeover is active, save message but keep AI quiet
  if (!conv.aiEnabled) {
    await db.insert(messages).values({
      businessId: business.id,
      conversationId: conv.id,
      sender: "customer",
      content: parsed.text,
      externalId: parsed.messageId,
    });

    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, conv.id));

    return {
      handled: true,
      status: "handoff",
      conversationId: conv.id,
      customerId: customer.id,
      reason: "human_agent_active",
    };
  }

  // AI response generation
  const model = options?.customModel || (isAiConfigured() ? createChatModel() : null);

  if (!model) {
    await db.insert(messages).values({
      businessId: business.id,
      conversationId: conv.id,
      sender: "customer",
      content: parsed.text,
      externalId: parsed.messageId,
    });

    await db
      .update(conversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(conversations.id, conv.id));

    return {
      handled: true,
      status: "no_ai",
      conversationId: conv.id,
      customerId: customer.id,
      reason: "ai_not_configured",
    };
  }

  const result = await handleCustomerMessage({
    businessId: business.id,
    conversationId: conv.id,
    text: parsed.text,
    model,
    embedder: createEmbedder(),
    externalId: parsed.messageId,
  });

  // Dispatch response bubbles back to Facebook Messenger / Instagram
  const senderFn =
    options?.sendReply ||
    (async (token: string, recipientId: string, bubble: string) => {
      await sendMetaMessage({
        pageAccessToken: token,
        recipientId,
        text: bubble,
      });
    });

  if (pageAccessToken && result.replies.length > 0) {
    for (const reply of result.replies) {
      try {
        await senderFn(pageAccessToken, parsed.senderId, reply.content);
      } catch (err) {
        console.error("Failed to send Meta reply bubble:", err);
      }
    }
  }

  return {
    handled: true,
    status: "success",
    conversationId: conv.id,
    customerId: customer.id,
    repliesCount: result.replies.length,
  };
}
