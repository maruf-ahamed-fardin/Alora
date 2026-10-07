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
  ParsedTelegramMessage,
  TelegramCredentials,
  TelegramUpdate,
} from "./types";

export class TelegramError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "TelegramError";
  }
}

/**
 * Validates and extracts a text message from a Telegram Update object.
 */
export function parseTelegramUpdate(
  update: unknown,
): ParsedTelegramMessage | null {
  if (!update || typeof update !== "object") return null;

  const raw = update as TelegramUpdate;
  const msg = raw.message || raw.edited_message;
  if (!msg || !msg.chat) return null;

  const text = (msg.text || msg.caption || "").trim();
  if (!text) return null;

  const from = msg.from;
  const firstName = from?.first_name || "";
  const lastName = from?.last_name || "";
  const senderName = [firstName, lastName].filter(Boolean).join(" ") || "Telegram User";

  const isCommand = text.startsWith("/");
  const commandMatch = text.match(/^\/([a-zA-Z0-9_]+)/);
  const command = commandMatch ? commandMatch[1].toLowerCase() : undefined;

  return {
    updateId: raw.update_id,
    messageId: String(msg.message_id),
    chatId: String(msg.chat.id),
    userId: String(from?.id ?? msg.chat.id),
    senderName,
    username: from?.username,
    text,
    date: new Date(msg.date * 1000),
    isCommand,
    command,
  };
}

/**
 * Sends a message bubble to Telegram via the Bot API.
 */
export async function sendTelegramMessage(options: {
  botToken: string;
  chatId: string | number;
  text: string;
  replyToMessageId?: string | number;
}): Promise<{ ok: boolean; messageId?: number; description?: string }> {
  const { botToken, chatId, text, replyToMessageId } = options;
  if (!botToken) {
    throw new TelegramError("Telegram Bot Token is not provided", "missing_token", 500);
  }

  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
  };

  if (replyToMessageId) {
    payload.reply_to_message_id = Number(replyToMessageId);
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = (await res.json()) as {
      ok: boolean;
      result?: { message_id: number };
      description?: string;
    };

    if (!res.ok || !data.ok) {
      console.error("Telegram sendMessage failed:", data);
      return {
        ok: false,
        description: data.description || `HTTP ${res.status}`,
      };
    }

    return {
      ok: true,
      messageId: data.result?.message_id,
    };
  } catch (err) {
    console.error("Network error sending Telegram message:", err);
    return {
      ok: false,
      description: err instanceof Error ? err.message : "Network error",
    };
  }
}

/**
 * Configures the Telegram webhook with Telegram servers.
 */
export async function setTelegramWebhook(options: {
  botToken: string;
  url: string;
  secretToken?: string;
}): Promise<{ ok: boolean; description?: string }> {
  const { botToken, url, secretToken } = options;

  const payload: Record<string, unknown> = {
    url,
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: false,
  };

  if (secretToken) {
    payload.secret_token = secretToken;
  }

  const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as { ok: boolean; description?: string };
  return { ok: data.ok, description: data.description };
}

/**
 * Inspects current webhook information from Telegram.
 */
export async function getTelegramWebhookInfo(options: {
  botToken: string;
}): Promise<{ ok: boolean; result?: unknown; description?: string }> {
  const { botToken } = options;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
  const data = (await res.json()) as { ok: boolean; result?: unknown; description?: string };
  return data;
}

/**
 * Removes the webhook configuration from Telegram.
 */
export async function deleteTelegramWebhook(options: {
  botToken: string;
}): Promise<{ ok: boolean; description?: string }> {
  const { botToken } = options;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/deleteWebhook`);
  const data = (await res.json()) as { ok: boolean; description?: string };
  return { ok: data.ok, description: data.description };
}

/**
 * Resolves the active Telegram channel for the business.
 */
export async function getActiveTelegramChannel(businessSlug = "demo-shop") {
  const db = getDb();

  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.slug, businessSlug));

  if (!business) {
    throw new TelegramError(`Business '${businessSlug}' not found`, "business_not_found", 404);
  }

  const [channel] = await db
    .select()
    .from(channels)
    .where(
      and(
        eq(channels.businessId, business.id),
        eq(channels.type, "telegram"),
        eq(channels.isActive, true),
      ),
    );

  if (!channel) {
    throw new TelegramError(
      `No active Telegram channel found for business '${businessSlug}'`,
      "channel_not_found",
      404,
    );
  }

  return { business, channel };
}

export type ProcessUpdateResult = {
  handled: boolean;
  status: "success" | "duplicate" | "ignored" | "handoff" | "no_ai";
  conversationId?: string;
  customerId?: string;
  repliesCount?: number;
  reason?: string;
};

/**
 * Core processor for incoming Telegram updates.
 * - Authenticates secret token
 * - Parses message
 * - Resolves customer & conversation
 * - Routes to AI or preserves handoff
 * - Delivers response bubbles back to Telegram
 */
export async function processTelegramUpdate(
  update: unknown,
  secretHeader?: string | null,
  options?: {
    businessSlug?: string;
    customModel?: ChatModel;
    sendReply?: (botToken: string, chatId: string, text: string) => Promise<unknown>;
  },
): Promise<ProcessUpdateResult> {
  const parsed = parseTelegramUpdate(update);
  if (!parsed) {
    return { handled: false, status: "ignored", reason: "no_text_message" };
  }

  const { business, channel } = await getActiveTelegramChannel(
    options?.businessSlug || "demo-shop",
  );

  const creds = (channel.credentials as TelegramCredentials) || {};
  const botToken = creds.botToken || process.env.TELEGRAM_BOT_TOKEN;
  const expectedSecret = creds.secretToken || process.env.TELEGRAM_WEBHOOK_SECRET;

  if (expectedSecret && secretHeader && secretHeader !== expectedSecret) {
    throw new TelegramError("Invalid Telegram secret token header", "unauthorized", 401);
  }

  const db = getDb();

  // Find or create customer
  let [customer] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.channelId, channel.id),
        eq(customers.externalId, parsed.userId),
      ),
    );

  if (!customer) {
    [customer] = await db
      .insert(customers)
      .values({
        businessId: business.id,
        channelId: channel.id,
        externalId: parsed.userId,
        name: parsed.senderName,
        notes: parsed.username ? `@${parsed.username}` : undefined,
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

  // Idempotency check: has this message already been processed?
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

  // If agent has taken over (aiEnabled is false), do not invoke AI
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
    // If AI is not configured, save customer message so it appears in /inbox
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

  const promptText =
    parsed.isCommand && parsed.command === "start"
      ? "Assalamu Alaikum! Apnader shop e ki ki ache?"
      : parsed.text;

  const result = await handleCustomerMessage({
    businessId: business.id,
    conversationId: conv.id,
    text: promptText,
    model,
    embedder: createEmbedder(),
    externalId: parsed.messageId,
  });

  // Dispatch generated bubbles back to Telegram
  const senderFn =
    options?.sendReply ||
    (async (token: string, chatId: string, bubble: string) => {
      await sendTelegramMessage({
        botToken: token,
        chatId,
        text: bubble,
      });
    });

  if (botToken && result.replies.length > 0) {
    for (const reply of result.replies) {
      try {
        await senderFn(botToken, parsed.chatId, reply.content);
      } catch (err) {
        console.error("Failed to send Telegram reply bubble:", err);
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
