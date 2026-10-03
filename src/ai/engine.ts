import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { businesses, conversations, messages } from "../db/schema";
import { splitIntoBubbles } from "./bubbles";
import type { ChatMessage, ChatModel, ModelUsage } from "./model";
import { buildSystemPrompt } from "./prompt";

const DEFAULT_HISTORY_LIMIT = 30;

export type Reply = { id: string; content: string; createdAt: Date };

export type ReplyResult = {
  /** Chat bubbles to send, in order. Empty when the AI is switched off. */
  replies: Reply[];
  model: string | null;
  usage: ModelUsage | null;
};

export class ConversationNotFoundError extends Error {
  constructor() {
    super("Conversation not found for this business.");
    this.name = "ConversationNotFoundError";
  }
}

type HandleMessage = {
  businessId: string;
  conversationId: string;
  text: string;
  model: ChatModel;
  /** How many recent messages the model sees. Older ones are dropped. */
  historyLimit?: number;
};

/**
 * One customer message in, the AI's reply bubbles out. Channel-agnostic: the
 * playground calls this today, the Telegram / Meta webhooks will tomorrow.
 *
 * The customer's message is saved before the model is called, so it is not
 * lost if the model fails; the error is rethrown for the caller to handle.
 */
export async function handleCustomerMessage({
  businessId,
  conversationId,
  text,
  model,
  historyLimit = DEFAULT_HISTORY_LIMIT,
}: HandleMessage): Promise<ReplyResult> {
  const db = getDb();

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.businessId, businessId),
      ),
    );
  if (!conversation) throw new ConversationNotFoundError();

  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId));

  await db.insert(messages).values({
    businessId,
    conversationId,
    sender: "customer",
    content: text,
  });
  await touch(conversationId);

  if (!conversation.aiEnabled) {
    return { replies: [], model: null, usage: null };
  }

  const history = await loadHistory(businessId, conversationId, historyLimit);
  const result = await model.reply({
    system: buildSystemPrompt(business),
    messages: history,
  });

  const bubbles = splitIntoBubbles(result.text);
  // Same-transaction rows would share created_at; space them out so the
  // order is stable when the thread is loaded again.
  const start = Date.now();
  const saved = await db
    .insert(messages)
    .values(
      bubbles.map((content, i) => ({
        businessId,
        conversationId,
        sender: "ai" as const,
        content,
        createdAt: new Date(start + i),
        metadata: i === 0 ? { model: result.model, usage: result.usage } : {},
      })),
    )
    .returning({
      id: messages.id,
      content: messages.content,
      createdAt: messages.createdAt,
    });
  await touch(conversationId);

  return {
    replies: saved.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    model: result.model,
    usage: result.usage,
  };
}

async function touch(conversationId: string) {
  await getDb()
    .update(conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

async function loadHistory(
  businessId: string,
  conversationId: string,
  limit: number,
): Promise<ChatMessage[]> {
  const recent = await getDb()
    .select({ sender: messages.sender, content: messages.content })
    .from(messages)
    .where(
      and(
        eq(messages.businessId, businessId),
        eq(messages.conversationId, conversationId),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit);

  const thread: ChatMessage[] = [];
  for (const m of recent.reverse()) {
    if (m.sender === "system") continue;
    const role = m.sender === "customer" ? "user" : "assistant";
    const last = thread[thread.length - 1];
    if (last?.role === role) {
      // Several bubbles in a row are one turn. Join the assistant's with the
      // same --- separator it writes, so it keeps seeing its own format.
      last.content += (role === "assistant" ? "\n---\n" : "\n") + m.content;
    } else {
      thread.push({ role, content: m.content });
    }
  }

  // A conversation must open with the customer; the window may start mid-thread.
  while (thread.length > 0 && thread[0].role !== "user") thread.shift();
  return thread;
}
