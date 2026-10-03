import { EMBEDDING_DIMENSIONS } from "../db/schema";
import type { Embedder } from "./embedder";

// A stand-in embedder for tests: hashes words into a 384-dimension bag of
// words, so texts that share words are close and others are not. It needs no
// model download and gives the same vector for the same text every time.

function fnv(word: string): number {
  let h = 2166136261;
  for (const ch of word) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function embedText(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    vector[fnv(word) % EMBEDDING_DIMENSIONS] += 1;
  }
  const norm = Math.sqrt(vector.reduce((s, x) => s + x * x, 0)) || 1;
  return vector.map((x) => x / norm);
}

export class HashEmbedder implements Embedder {
  readonly model = "hash-test";
  calls = 0;

  async embedPassages(texts: string[]) {
    this.calls++;
    return texts.map(embedText);
  }
  async embedQuery(text: string) {
    this.calls++;
    return embedText(text);
  }
  async embedQueries(texts: string[]) {
    this.calls++;
    return texts.map(embedText);
  }
}
