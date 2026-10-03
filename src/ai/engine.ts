import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { businesses, conversations, messages } from "../db/schema";
import type { Embedder } from "../knowledge/embedder";
import {
  searchKnowledge,
  searchToneExamples,
  type KnowledgeHit,
  type ToneHit,
} from "../knowledge/retrieval";
import { splitIntoBubbles } from "./bubbles";
import { buildContext } from "./context";
import type { ChatMessage, ChatModel, ModelUsage, ToolCall } from "./model";
import { buildSystemPrompt } from "./prompt";
import { buildTools } from "./tools";

const DEFAULT_HISTORY_LIMIT = 30;
const KNOWLEDGE_HITS = 3;
const TONE_HITS = 3;
// A message like "L" or "dam?" says nothing alone; add the one before it.
const SHORT_MESSAGE = 20;

export type Reply = { id: string; content: string; createdAt: Date };

export type ReplyResult = {
  /** Chat bubbles to send, in order. Empty when the AI is switched off. */
  replies: Reply[];
  model: string | null;
  usage: ModelUsage | null;
  /** What was looked up for this message (for the playground and evaluation). */
  retrieved: { knowledge: KnowledgeHit[]; examples: ToneHit[] };
  /** Lookups and actions the model made to write the reply, in order. */
  toolCalls: ToolCall[];
};

const nothingRetrieved = () => ({ knowledge: [], examples: [] });

/**
 * The text to search the shop's records with. Customers write short follow-ups
 * ("L", "price?"), so a very short last message is searched together with the
 * customer message before it.
 */
export function retrievalQuery(history: ChatMessage[]): string {
  const customerTurns = history.filter((m) => m.role === "user").map((m) => m.content);
  const last = customerTurns.at(-1) ?? "";
  const before = customerTurns.at(-2);
  return last.length < SHORT_MESSAGE && before ? `${before}\n${last}` : last;
}

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
  /** Without one, the model gets no shop information (D2 behaviour). */
  embedder?: Embedder;
  /** How many recent messages the model sees. Older ones are dropped. */
  historyLimit?: number;
  /** Product, stock, delivery, order and handoff tools. On by default. */
  useTools?: boolean;
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
  embedder,
  historyLimit = DEFAULT_HISTORY_LIMIT,
  useTools = true,
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
    return {
      replies: [],
      model: null,
      usage: null,
      retrieved: nothingRetrieved(),
      toolCalls: [],
    };
  }

  const history = await loadHistory(businessId, conversationId, historyLimit);

  const retrieved = embedder
    ? await retrieve(businessId, retrievalQuery(history), embedder)
    : null;

  const result = await model.reply({
    system: buildSystemPrompt(business),
    context: retrieved
      ? buildContext(retrieved.knowledge, retrieved.examples)
      : undefined,
    messages: history,
    // Which shop and which customer comes from the conversation, not from the model.
    tools: useTools
      ? buildTools({ businessId, conversationId, customerId: conversation.customerId })
      : undefined,
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
        metadata:
          i === 0
            ? {
                model: result.model,
                usage: result.usage,
                sources: retrieved?.knowledge.map((k) => k.title) ?? [],
                toolCalls: result.toolCalls,
              }
            : {},
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
    retrieved: retrieved ?? nothingRetrieved(),
    toolCalls: result.toolCalls,
  };
}

// A failing search (embedding model down) must not stop the customer getting
// an answer. With nothing retrieved the prompt tells the model to say a team
// member will confirm, which is safe.
async function retrieve(businessId: string, query: string, embedder: Embedder) {
  try {
    const [knowledge, examples] = await Promise.all([
      searchKnowledge(businessId, query, embedder, KNOWLEDGE_HITS),
      searchToneExamples(businessId, query, embedder, TONE_HITS),
    ]);
    return { knowledge, examples };
  } catch (err) {
    console.error("Retrieval failed; replying without shop information.", err);
    return nothingRetrieved();
  }
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
