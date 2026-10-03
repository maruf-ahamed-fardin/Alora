// Cuts a document into pieces small enough to embed and search on their own.
// Shop documents are short, so most come out as a single chunk; the splitting
// matters for long policies and catalogs.

export const DEFAULT_MAX_CHARS = 600;

// Sentence ends: Bangla danda (।), full stop, question and exclamation marks.
const SENTENCE_END = /(?<=[।.?!])\s+/;

export function chunkText(text: string, maxChars = DEFAULT_MAX_CHARS): string[] {
  const paragraphs = text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current) chunks.push(current);
    current = "";
  };

  for (const paragraph of paragraphs) {
    for (const sentence of paragraph.split(SENTENCE_END)) {
      for (const piece of hardSplit(sentence, maxChars)) {
        if (current && current.length + 1 + piece.length > maxChars) flush();
        current = current ? `${current} ${piece}` : piece;
      }
    }
    // A paragraph break is a good place to start a new chunk if the current
    // one is already reasonably full.
    if (current.length > maxChars / 2) flush();
  }
  flush();
  return chunks;
}

// A single sentence longer than the limit (a pasted table, a URL list) is cut
// at the last space before the limit.
function hardSplit(sentence: string, maxChars: number): string[] {
  if (sentence.length <= maxChars) return [sentence];
  const parts: string[] = [];
  let rest = sentence;
  while (rest.length > maxChars) {
    const cut = rest.lastIndexOf(" ", maxChars);
    const at = cut > 0 ? cut : maxChars;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}
