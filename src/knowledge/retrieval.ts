import { and, cosineDistance, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  knowledgeChunks,
  knowledgeDocuments,
  toneExamples,
} from "../db/schema";
import type { Embedder } from "./embedder";

export type KnowledgeHit = {
  content: string;
  title: string;
  kind: string;
  /** Cosine similarity, 1 = identical direction. Compare within one query only. */
  similarity: number;
};

export type ToneHit = {
  customerMessage: string;
  reply: string;
  similarity: number;
};

/** The chunks of this business's documents that best match the question. */
export async function searchKnowledge(
  businessId: string,
  query: string,
  embedder: Embedder,
  limit = 3,
): Promise<KnowledgeHit[]> {
  if (!query.trim()) return [];
  const vector = await embedder.embedQuery(query);
  const distance = cosineDistance(knowledgeChunks.embedding, vector);

  return getDb()
    .select({
      content: knowledgeChunks.content,
      title: knowledgeDocuments.title,
      kind: knowledgeDocuments.kind,
      similarity: sql<number>`1 - (${distance})`,
    })
    .from(knowledgeChunks)
    .innerJoin(
      knowledgeDocuments,
      and(
        eq(knowledgeDocuments.businessId, knowledgeChunks.businessId),
        eq(knowledgeDocuments.id, knowledgeChunks.documentId),
      ),
    )
    .where(
      and(
        eq(knowledgeChunks.businessId, businessId),
        // Vectors from another model are not comparable.
        eq(knowledgeChunks.embeddingModel, embedder.model),
      ),
    )
    .orderBy(distance)
    .limit(limit);
}

/** The shop's past replies to messages most like this one (style examples). */
export async function searchToneExamples(
  businessId: string,
  query: string,
  embedder: Embedder,
  limit = 3,
): Promise<ToneHit[]> {
  if (!query.trim()) return [];
  const vector = await embedder.embedQuery(query);
  const distance = cosineDistance(toneExamples.embedding, vector);

  return getDb()
    .select({
      customerMessage: toneExamples.customerMessage,
      reply: toneExamples.reply,
      similarity: sql<number>`1 - (${distance})`,
    })
    .from(toneExamples)
    .where(
      and(
        eq(toneExamples.businessId, businessId),
        isNotNull(toneExamples.embedding),
        eq(toneExamples.embeddingModel, embedder.model),
      ),
    )
    .orderBy(distance)
    .limit(limit);
}
