import { and, eq, isNull, ne, or } from "drizzle-orm";
import { getDb } from "../db/client";
import { knowledgeChunks, knowledgeDocuments, toneExamples } from "../db/schema";
import { chunkText } from "./chunker";
import type { Embedder } from "./embedder";

export class DocumentNotFoundError extends Error {
  constructor() {
    super("Knowledge document not found for this business.");
    this.name = "DocumentNotFoundError";
  }
}

/**
 * (Re)build the searchable chunks of one document. The title is put in front
 * of every chunk, so a chunk that says "৬০ টাকা" still knows it is about
 * delivery. Old chunks are replaced in one transaction, so searches never see
 * a half-indexed document.
 */
export async function indexDocument(
  businessId: string,
  documentId: string,
  embedder: Embedder,
): Promise<number> {
  const db = getDb();
  const [doc] = await db
    .select()
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.businessId, businessId),
        eq(knowledgeDocuments.id, documentId),
      ),
    );
  if (!doc) throw new DocumentNotFoundError();

  const texts = chunkText(doc.content).map((piece) => `${doc.title}: ${piece}`);
  // Embed before touching the database: if the model fails, the old chunks stay.
  const vectors = await embedder.embedPassages(texts);

  await db.transaction(async (tx) => {
    await tx.delete(knowledgeChunks).where(eq(knowledgeChunks.documentId, doc.id));
    if (texts.length === 0) return;
    await tx.insert(knowledgeChunks).values(
      texts.map((content, i) => ({
        businessId,
        documentId: doc.id,
        chunkIndex: i,
        content,
        embedding: vectors[i],
        embeddingModel: embedder.model,
      })),
    );
  });
  return texts.length;
}

/** Embed the tone examples that have no vector yet, or one from another model. */
export async function indexToneExamples(
  businessId: string,
  embedder: Embedder,
): Promise<number> {
  const db = getDb();
  const pending = await db
    .select({ id: toneExamples.id, customerMessage: toneExamples.customerMessage })
    .from(toneExamples)
    .where(
      and(
        eq(toneExamples.businessId, businessId),
        or(
          isNull(toneExamples.embedding),
          ne(toneExamples.embeddingModel, embedder.model),
        ),
      ),
    );
  if (pending.length === 0) return 0;

  // Matched against what customers type, so embedded like a query.
  const vectors = await embedder.embedQueries(pending.map((p) => p.customerMessage));
  for (const [i, row] of pending.entries()) {
    await db
      .update(toneExamples)
      .set({ embedding: vectors[i], embeddingModel: embedder.model })
      .where(
        and(eq(toneExamples.businessId, businessId), eq(toneExamples.id, row.id)),
      );
  }
  return pending.length;
}

/** Index everything a business has. Safe to re-run. */
export async function indexBusiness(businessId: string, embedder: Embedder) {
  const docs = await getDb()
    .select({ id: knowledgeDocuments.id })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.businessId, businessId));

  let chunks = 0;
  for (const doc of docs) chunks += await indexDocument(businessId, doc.id, embedder);
  const examples = await indexToneExamples(businessId, embedder);
  return { documents: docs.length, chunks, examples };
}
