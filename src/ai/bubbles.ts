const MAX_BUBBLES = 3;

// The model is told to put a line containing only "---" between messages
// that should arrive as separate chat bubbles. It is also told not to use
// markdown, but a stray **bold** would show up literally in WhatsApp.
export function splitIntoBubbles(text: string): string[] {
  const clean = text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");

  const parts = clean
    .split(/^[ \t]*---[ \t]*$/m)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return [];
  if (parts.length <= MAX_BUBBLES) return parts;

  // Too many bubbles feels like spam: fold the rest into the last one.
  const head = parts.slice(0, MAX_BUBBLES - 1);
  return [...head, parts.slice(MAX_BUBBLES - 1).join("\n")];
}
