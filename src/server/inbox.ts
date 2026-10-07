import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  businesses,
  channels,
  conversations,
  customers,
  messages,
  orders,
  type conversationStatus,
  type channelType,
} from "../db/schema";
import { handleCustomerMessage, type ReplyResult } from "../ai/engine";
import { createChatModel, isAiConfigured } from "../ai/factory";
import { createEmbedder } from "../knowledge/embedder";
import { getSessionFromCookies } from "./auth";

export type ConversationStatus = (typeof conversationStatus.enumValues)[number];
export type ChannelType = (typeof channelType.enumValues)[number];

export class InboxError extends Error {
  constructor(message: string, public code: string, public status: number = 400) {
    super(message);
    this.name = "InboxError";
  }
}

export type InboxFilters = {
  status?: string;
  channel?: string;
  search?: string;
};

export type ConversationSummary = {
  id: string;
  status: ConversationStatus;
  aiEnabled: boolean;
  lastMessageAt: Date;
  createdAt: Date;
  customer: {
    id: string;
    name: string | null;
    phone: string | null;
    externalId: string;
  };
  channel: {
    id: string;
    type: ChannelType;
    name: string;
  };
  lastMessage?: {
    id: string;
    sender: "customer" | "ai" | "agent" | "system";
    content: string;
    createdAt: Date;
  };
  unread: boolean;
};

export async function getInboxBusiness(requestedSlug?: string) {
  if (!requestedSlug) {
    try {
      const session = await getSessionFromCookies();
      if (session) {
        const [business] = await getDb()
          .select()
          .from(businesses)
          .where(eq(businesses.id, session.business.id));
        if (business) return business;
      }
    } catch {
      // Outside request context (e.g. tests), fall through to slug
    }
  }

  const slug = requestedSlug ?? "demo-shop";
  const [business] = await getDb()
    .select()
    .from(businesses)
    .where(eq(businesses.slug, slug));
  if (!business) {
    throw new InboxError("Business not found", "not_found", 404);
  }
  return business;
}

export async function listInboxConversations(
  businessId: string,
  filters: InboxFilters = {},
): Promise<ConversationSummary[]> {
  const db = getDb();

  const conditions = [eq(conversations.businessId, businessId)];

  if (filters.status && filters.status !== "all") {
    conditions.push(eq(conversations.status, filters.status as ConversationStatus));
  }

  if (filters.channel && filters.channel !== "all") {
    conditions.push(eq(channels.type, filters.channel as ChannelType));
  }

  const baseQuery = db
    .select({
      id: conversations.id,
      status: conversations.status,
      aiEnabled: conversations.aiEnabled,
      lastMessageAt: conversations.lastMessageAt,
      createdAt: conversations.createdAt,
      customerId: customers.id,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerExternalId: customers.externalId,
      channelId: channels.id,
      channelType: channels.type,
      channelName: channels.name,
    })
    .from(conversations)
    .innerJoin(customers, eq(conversations.customerId, customers.id))
    .innerJoin(channels, eq(conversations.channelId, channels.id))
    .where(and(...conditions))
    .orderBy(desc(conversations.lastMessageAt));

  const rows = await baseQuery;

  const results: ConversationSummary[] = [];

  for (const row of rows) {
    if (filters.search?.trim()) {
      const q = filters.search.toLowerCase();
      const nameMatch = row.customerName?.toLowerCase().includes(q);
      const phoneMatch = row.customerPhone?.toLowerCase().includes(q);
      const externalMatch = row.customerExternalId.toLowerCase().includes(q);
      if (!nameMatch && !phoneMatch && !externalMatch) {
        continue;
      }
    }

    const [latest] = await db
      .select({
        id: messages.id,
        sender: messages.sender,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        and(
          eq(messages.businessId, businessId),
          eq(messages.conversationId, row.id),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(1);

    results.push({
      id: row.id,
      status: row.status,
      aiEnabled: row.aiEnabled,
      lastMessageAt: row.lastMessageAt,
      createdAt: row.createdAt,
      customer: {
        id: row.customerId,
        name: row.customerName,
        phone: row.customerPhone,
        externalId: row.customerExternalId,
      },
      channel: {
        id: row.channelId,
        type: row.channelType,
        name: row.channelName,
      },
      lastMessage: latest,
      unread: latest?.sender === "customer",
    });
  }

  return results;
}

export async function getConversationDetails(businessId: string, conversationId: string) {
  const db = getDb();

  const [row] = await db
    .select({
      id: conversations.id,
      status: conversations.status,
      aiEnabled: conversations.aiEnabled,
      lastMessageAt: conversations.lastMessageAt,
      createdAt: conversations.createdAt,
      customerId: customers.id,
      customerName: customers.name,
      customerPhone: customers.phone,
      customerNotes: customers.notes,
      customerExternalId: customers.externalId,
      channelId: channels.id,
      channelType: channels.type,
      channelName: channels.name,
    })
    .from(conversations)
    .innerJoin(customers, eq(conversations.customerId, customers.id))
    .innerJoin(channels, eq(conversations.channelId, channels.id))
    .where(
      and(
        eq(conversations.businessId, businessId),
        eq(conversations.id, conversationId),
      ),
    );

  if (!row) {
    throw new InboxError("Conversation not found", "conversation_not_found", 404);
  }

  const customerOrders = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      total: orders.total,
      placedAt: orders.placedAt,
      courier: orders.courier,
      trackingCode: orders.trackingCode,
    })
    .from(orders)
    .where(
      and(
        eq(orders.businessId, businessId),
        eq(orders.customerId, row.customerId),
      ),
    )
    .orderBy(desc(orders.placedAt));

  return {
    ...row,
    orders: customerOrders,
  };
}

export async function listConversationMessages(businessId: string, conversationId: string) {
  const db = getDb();

  return db
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
    .orderBy(messages.createdAt);
}

export async function sendAgentMessage(
  businessId: string,
  conversationId: string,
  content: string,
) {
  const text = content.trim();
  if (!text) {
    throw new InboxError("Message content cannot be empty", "empty_content", 400);
  }

  const db = getDb();

  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, businessId),
        eq(conversations.id, conversationId),
      ),
    );

  if (!conv) {
    throw new InboxError("Conversation not found", "not_found", 404);
  }

  const [message] = await db
    .insert(messages)
    .values({
      businessId,
      conversationId,
      sender: "agent",
      content: text,
    })
    .returning();

  await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(
      and(
        eq(conversations.businessId, businessId),
        eq(conversations.id, conversationId),
      ),
    );

  // If this conversation is on Telegram, forward agent reply directly to the customer
  try {
    const [channel] = await db
      .select()
      .from(channels)
      .where(eq(channels.id, conv.channelId));

    if (channel && channel.type === "telegram") {
      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, conv.customerId));

      const creds = (channel.credentials as { botToken?: string }) || {};
      const botToken = creds.botToken || process.env.TELEGRAM_BOT_TOKEN;
      if (botToken && cust?.externalId) {
        const { sendTelegramMessage } = await import("./channels/telegram");
        await sendTelegramMessage({
          botToken,
          chatId: cust.externalId,
          text,
        });
      }
    }

    if (channel && (channel.type === "messenger" || channel.type === "instagram")) {
      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, conv.customerId));

      const creds = (channel.credentials as { pageAccessToken?: string }) || {};
      const token =
        creds.pageAccessToken ||
        (channel.type === "instagram"
          ? process.env.INSTAGRAM_ACCESS_TOKEN || process.env.META_PAGE_ACCESS_TOKEN
          : process.env.META_PAGE_ACCESS_TOKEN);

      if (token && cust?.externalId) {
        const { sendMetaMessage } = await import("./channels/meta");
        await sendMetaMessage({
          pageAccessToken: token,
          recipientId: cust.externalId,
          text,
        });
      }
    }

    if (channel && channel.type === "whatsapp") {
      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, conv.customerId));

      const creds = (channel.credentials as { accessToken?: string; phoneNumberId?: string }) || {};
      const token = creds.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
      const phoneId = creds.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || channel.externalId || "";

      if (token && phoneId && cust?.externalId) {
        const { sendWhatsAppMessage } = await import("./channels/whatsapp");
        await sendWhatsAppMessage({
          accessToken: token,
          phoneNumberId: phoneId,
          to: cust.externalId,
          text,
        });
      }
    }
  } catch (err) {
    console.error("Failed to forward agent reply to external channel:", err);
  }

  return message;
}

export async function toggleAi(
  businessId: string,
  conversationId: string,
  enabled: boolean,
) {
  const db = getDb();

  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, businessId),
        eq(conversations.id, conversationId),
      ),
    );

  if (!conv) {
    throw new InboxError("Conversation not found", "not_found", 404);
  }

  const newStatus = enabled ? "open" : "handoff";

  await db
    .update(conversations)
    .set({
      aiEnabled: enabled,
      status: newStatus,
      lastMessageAt: new Date(),
    })
    .where(
      and(
        eq(conversations.businessId, businessId),
        eq(conversations.id, conversationId),
      ),
    );

  const [systemNote] = await db
    .insert(messages)
    .values({
      businessId,
      conversationId,
      sender: "system",
      content: enabled
        ? "AI assistant resumed by agent."
        : "Human agent took over. AI assistant paused.",
    })
    .returning();

  return { conversationId, aiEnabled: enabled, status: newStatus, note: systemNote };
}

export async function updateConversationStatus(
  businessId: string,
  conversationId: string,
  status: ConversationStatus,
) {
  const db = getDb();

  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, businessId),
        eq(conversations.id, conversationId),
      ),
    );

  if (!conv) {
    throw new InboxError("Conversation not found", "not_found", 404);
  }

  const aiEnabled = status === "closed" ? false : conv.aiEnabled;

  await db
    .update(conversations)
    .set({
      status,
      aiEnabled,
      lastMessageAt: new Date(),
    })
    .where(
      and(
        eq(conversations.businessId, businessId),
        eq(conversations.id, conversationId),
      ),
    );

  return { conversationId, status, aiEnabled };
}

export async function simulateIncomingCustomerMessage(
  businessId: string,
  conversationId: string,
  text: string,
): Promise<{ customerMessageId: string; aiReplies: ReplyResult | null }> {
  const cleanText = text.trim();
  if (!cleanText) {
    throw new InboxError("Message cannot be empty", "empty_content", 400);
  }

  const db = getDb();

  const [conv] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.businessId, businessId),
        eq(conversations.id, conversationId),
      ),
    );

  if (!conv) {
    throw new InboxError("Conversation not found", "not_found", 404);
  }

  if (conv.aiEnabled && isAiConfigured()) {
    const model = createChatModel();
    const embedder = createEmbedder();
    const result = await handleCustomerMessage({
      businessId,
      conversationId,
      text: cleanText,
      model,
      embedder,
    });
    return { customerMessageId: `msg-${Date.now()}`, aiReplies: result };
  }

  const [msg] = await db
    .insert(messages)
    .values({
      businessId,
      conversationId,
      sender: "customer",
      content: cleanText,
    })
    .returning();

  await db
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(
      and(
        eq(conversations.businessId, businessId),
        eq(conversations.id, conversationId),
      ),
    );

  return { customerMessageId: msg.id, aiReplies: null };
}
