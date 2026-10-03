import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  knowledgeDocuments,
  knowledgeKind,
  toneExamples,
} from "../db/schema";
import type { Embedder } from "../knowledge/embedder";
import { indexDocument, indexToneExamples } from "../knowledge/indexing";

// What a shop owner does in the dashboard: add, edit and remove the facts and
// past replies the AI draws on. Every write re-indexes right away, so the AI
// uses the change on the very next message.

export type DocumentKind = (typeof knowledgeKind.enumValues)[number];
export const DOCUMENT_KINDS = knowledgeKind.enumValues;

export const LIMITS = {
  title: 200,
  content: 20_000,
  customerMessage: 500,
  reply: 2_000,
};

// Straight from request.json(); every field is validated before use.
type JsonObject = Record<string, unknown>;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends Error {
  constructor() {
    super("Not found for this business.");
    this.name = "NotFoundError";
  }
}

function text(value: unknown, field: string, max: number): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) throw new ValidationError(`${field} is required.`);
  if (s.length > max) throw new ValidationError(`${field} is longer than ${max} characters.`);
  return s;
}

function kind(value: unknown): DocumentKind {
  if (typeof value === "string" && (DOCUMENT_KINDS as readonly string[]).includes(value)) {
    return value as DocumentKind;
  }
  throw new ValidationError(`kind must be one of: ${DOCUMENT_KINDS.join(", ")}.`);
}

export async function listKnowledge(businessId: string) {
  const db = getDb();
  const documents = await db
    .select({
      id: knowledgeDocuments.id,
      kind: knowledgeDocuments.kind,
      title: knowledgeDocuments.title,
      content: knowledgeDocuments.content,
      // Spelled out with table names: inside a subquery drizzle prints bare
      // column names, and a bare "id" would mean the chunk's own id.
      chunkCount: sql<number>`(select count(*)::int from knowledge_chunks kc where kc.document_id = "knowledge_documents"."id")`,
    })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.businessId, businessId))
    .orderBy(asc(knowledgeDocuments.createdAt), asc(knowledgeDocuments.id));

  const examples = await db
    .select({
      id: toneExamples.id,
      customerMessage: toneExamples.customerMessage,
      reply: toneExamples.reply,
      indexed: sql<boolean>`${toneExamples.embedding} is not null`,
    })
    .from(toneExamples)
    .where(eq(toneExamples.businessId, businessId))
    .orderBy(asc(toneExamples.createdAt), asc(toneExamples.id));

  return { documents, examples };
}

export async function addDocument(
  businessId: string,
  input: JsonObject,
  embedder: Embedder,
) {
  const values = {
    kind: kind(input.kind),
    title: text(input.title, "title", LIMITS.title),
    content: text(input.content, "content", LIMITS.content),
  };
  const [doc] = await getDb()
    .insert(knowledgeDocuments)
    .values({ businessId, ...values })
    .returning();
  await indexDocument(businessId, doc.id, embedder);
  return doc;
}

export async function updateDocument(
  businessId: string,
  id: string,
  input: JsonObject,
  embedder: Embedder,
) {
  const values = {
    kind: kind(input.kind),
    title: text(input.title, "title", LIMITS.title),
    content: text(input.content, "content", LIMITS.content),
  };
  const [doc] = await getDb()
    .update(knowledgeDocuments)
    .set(values)
    .where(and(eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.id, id)))
    .returning();
  if (!doc) throw new NotFoundError();
  await indexDocument(businessId, doc.id, embedder);
  return doc;
}

export async function deleteDocument(businessId: string, id: string) {
  // Chunks go with the document (cascade).
  const deleted = await getDb()
    .delete(knowledgeDocuments)
    .where(and(eq(knowledgeDocuments.businessId, businessId), eq(knowledgeDocuments.id, id)))
    .returning({ id: knowledgeDocuments.id });
  if (deleted.length === 0) throw new NotFoundError();
}

export async function addExample(
  businessId: string,
  input: JsonObject,
  embedder: Embedder,
) {
  const [example] = await getDb()
    .insert(toneExamples)
    .values({
      businessId,
      customerMessage: text(input.customerMessage, "customerMessage", LIMITS.customerMessage),
      reply: text(input.reply, "reply", LIMITS.reply),
    })
    .returning();
  await indexToneExamples(businessId, embedder);
  return example;
}

export async function deleteExample(businessId: string, id: string) {
  const deleted = await getDb()
    .delete(toneExamples)
    .where(and(eq(toneExamples.businessId, businessId), eq(toneExamples.id, id)))
    .returning({ id: toneExamples.id });
  if (deleted.length === 0) throw new NotFoundError();
}
