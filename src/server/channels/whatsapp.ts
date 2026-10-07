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
  ParsedWhatsAppMessage,
  WhatsAppCredentials,
  WhatsAppWebhookPayload,
} from "./types";

export class WhatsAppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "WhatsAppError";
  }
}

/**
 * Validates Meta's WhatsApp webhook subscription challenge (GET request).
 */
export function verifyWhatsAppWebhook(params: {
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
 * Parses incoming WhatsApp Cloud API webhook payload.
 * Extracts messages, customer contact profiles, phone number ID, and text.
 * Ignores status receipts (sent, delivered, read).
 */
export function parseWhatsAppWebhook(body: unknown): ParsedWhatsAppMessage[] {
  if (!body || typeof body !== "object") return [];

  const raw = body as WhatsAppWebhookPayload;
  if (raw.object !== "whatsapp_business_account" || !Array.isArray(raw.entry)) {
    return [];
  }

  const results: ParsedWhatsAppMessage[] = [];

  for (const entry of raw.entry) {
    const changes = entry.changes || [];

    for (const change of changes) {
      if (change.field !== "messages") continue;

      const value = change.value;
      if (!value || !value.messages || !Array.isArray(value.messages)) continue;

      const phoneNumberId = value.metadata?.phone_number_id || "";
      const contactsMap = new Map<string, string>();

      if (value.contacts && Array.isArray(value.contacts)) {
        for (const contact of value.contacts) {
          if (contact.wa_id && contact.profile?.name) {
            contactsMap.set(contact.wa_id, contact.profile.name);
          }
        }
      }

      for (const msg of value.messages) {
        const text =
          msg.text?.body ||
          msg.interactive?.button_reply?.title ||
          msg.interactive?.list_reply?.title ||
          msg.caption ||
          "";

        const trimmedText = text.trim();
        if (!trimmedText || !msg.from) continue;

        const senderPhone = String(msg.from);
        const senderName = contactsMap.get(senderPhone) || `WhatsApp User (+${senderPhone})`;
        const timestamp = new Date(Number(msg.timestamp) * 1000);

        results.push({
          phoneNumberId,
          senderPhone,
          senderName,
          messageId: String(msg.id),
          text: trimmedText,
          timestamp: isNaN(timestamp.getTime()) ? new Date() : timestamp,
        });
      }
    }
  }

  return results;
}

/**
 * Sends a message via WhatsApp Cloud API Messages endpoint.
 */
export async function sendWhatsAppMessage(options: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  text: string;
}): Promise<{ ok: boolean; messageId?: string; description?: string }> {
  const { accessToken, phoneNumberId, to, text } = options;

  if (!accessToken) {
    throw new WhatsAppError("WhatsApp access token is missing", "missing_token", 500);
  }
  if (!phoneNumberId) {
    throw new WhatsAppError("WhatsApp phone number ID is missing", "missing_phone_id", 500);
  }

  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to.replace(/\D/g, ""), // ensure clean numeric format
    type: "text",
    text: {
      preview_url: false,
      body: text,
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message: string; code: number };
    };

    if (!res.ok || data.error) {
      console.error("WhatsApp Cloud API send error:", data.error);
      return {
        ok: false,
        description: data.error?.message || `HTTP ${res.status}`,
      };
    }

    return {
      ok: true,
      messageId: data.messages?.[0]?.id,
    };
  } catch (err) {
    console.error("Network error sending WhatsApp message:", err);
    return {
      ok: false,
      description: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Resolves the active WhatsApp channel for the business.
 */
export async function getActiveWhatsAppChannel(
  phoneNumberId?: string,
  businessSlug = "demo-shop",
) {
  const db = getDb();

  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, businessSlug));

  if (!business) {
    throw new WhatsAppError(`Business '${businessSlug}' not found`, "business_not_found", 404);
  }

  const conditions = [
    eq(channels.businessId, business.id),
    eq(channels.type, "whatsapp"),
    eq(channels.isActive, true),
  ];

  if (phoneNumberId) {
    conditions.push(eq(channels.externalId, phoneNumberId));
  }

  let [channel] = await db.select().from(channels).where(and(...conditions));

  // Fallback to first active WhatsApp channel if specific phone number ID not found
  if (!channel) {
    [channel] = await db
      .select()
      .from(channels)
      .where(
        and(
          eq(channels.businessId, business.id),
          eq(channels.type, "whatsapp"),
          eq(channels.isActive, true),
        ),
      );
  }

  if (!channel) {
    throw new WhatsAppError(
      `No active WhatsApp channel found for business '${businessSlug}'`,
      "channel_not_found",
      404,
    );
  }

  return { business, channel };
}

export type ProcessWhatsAppResult = {
  handled: boolean;
  status: "success" | "duplicate" | "handoff" | "no_ai";
  conversationId?: string;
  customerId?: string;
  repliesCount?: number;
  reason?: string;
};

/**
 * Core processor for a single parsed WhatsApp message.
 */
export async function processWhatsAppMessage(
  parsed: ParsedWhatsAppMessage,
  options?: {
    businessSlug?: string;
    customModel?: ChatModel;
    sendReply?: (accessToken: string, phoneNumberId: string, to: string, text: string) => Promise<unknown>;
  },
): Promise<ProcessWhatsAppResult> {
  const { business, channel } = await getActiveWhatsAppChannel(
    parsed.phoneNumberId,
    options?.businessSlug || "demo-shop",
  );

  const creds = (channel.credentials as WhatsAppCredentials) || {};
  const accessToken = creds.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = creds.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || channel.externalId || "";

  const db = getDb();

  // Find or create customer
  let [customer] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.channelId, channel.id),
        eq(customers.externalId, parsed.senderPhone),
      ),
    );

  if (!customer) {
    [customer] = await db
      .insert(customers)
      .values({
        businessId: business.id,
        channelId: channel.id,
        externalId: parsed.senderPhone,
        name: parsed.senderName,
        phone: parsed.senderPhone,
      })
      .returning();
  } else if (parsed.senderName && customer.name !== parsed.senderName) {
    await db
      .update(customers)
      .set({ name: parsed.senderName })
      .where(eq(customers.id, customer.id));
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

  // Idempotency: skip already processed wamid
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

  // If human agent has taken over, save customer message but keep AI silent
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

  // Run AI processing
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

  // Dispatch response bubbles back to WhatsApp Cloud API
  const senderFn =
    options?.sendReply ||
    (async (token: string, phoneId: string, to: string, bubble: string) => {
      await sendWhatsAppMessage({
        accessToken: token,
        phoneNumberId: phoneId,
        to,
        text: bubble,
      });
    });

  if (accessToken && phoneNumberId && result.replies.length > 0) {
    for (const reply of result.replies) {
      try {
        await senderFn(accessToken, phoneNumberId, parsed.senderPhone, reply.content);
      } catch (err) {
        console.error("Failed to send WhatsApp reply bubble:", err);
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
