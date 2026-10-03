import { env, pipeline } from "@huggingface/transformers";
import { EMBEDDING_DIMENSIONS } from "../db/schema";

// Turns text into vectors so "delivery charge koto?" can be matched with a
// Bangla policy about delivery. Swappable: the rest of the app only sees this
// interface, so Voyage, Cohere or BGE-M3 can replace the local model later
// (a model with a different vector size also needs a migration and re-index).

export interface Embedder {
  /** Stored with every vector; vectors from different models do not mix. */
  readonly model: string;
  /** For text that will be stored and searched (knowledge, past replies). */
  embedPassages(texts: string[]): Promise<number[][]>;
  /** For what the customer typed. */
  embedQuery(text: string): Promise<number[]>;
  /** Several short texts compared with each other, like past customer messages. */
  embedQueries(texts: string[]): Promise<number[][]>;
}

const MODEL_ID = "Xenova/multilingual-e5-small";

// Runs on this machine, no API key. It covers Bangla and English well; Roman
// Bangla ("Banglish") is the weak spot, which is what the kb:eval script
// measures. The model files (~120 MB) are downloaded once into .data/models.
export class LocalE5Embedder implements Embedder {
  readonly model = MODEL_ID;

  // e5 models expect these prefixes; without them quality drops noticeably.
  async embedPassages(texts: string[]) {
    return this.embed(texts.map((t) => `passage: ${t}`));
  }

  async embedQuery(text: string) {
    const [vector] = await this.embed([`query: ${text}`]);
    return vector;
  }

  async embedQueries(texts: string[]) {
    return this.embed(texts.map((t) => `query: ${t}`));
  }

  private async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const extractor = await getExtractor();
    const output = await extractor(texts, { pooling: "mean", normalize: true });
    const vectors = output.tolist() as number[][];
    if (vectors[0]?.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding model returned ${vectors[0]?.length} dimensions, the database expects ${EMBEDDING_DIMENSIONS}.`,
      );
    }
    return vectors;
  }
}

type Extractor = Awaited<ReturnType<typeof loadExtractor>>;
const globalForModel = globalThis as unknown as { __aloraExtractor?: Promise<Extractor> };

async function loadExtractor() {
  env.cacheDir = ".data/models";
  return pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
}

// Loaded once per process (a few seconds), then reused.
function getExtractor() {
  return (globalForModel.__aloraExtractor ??= loadExtractor());
}

export function createEmbedder(): Embedder {
  return new LocalE5Embedder();
}
