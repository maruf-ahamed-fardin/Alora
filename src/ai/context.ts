import type { KnowledgeHit, ToneHit } from "../knowledge/retrieval";

// What changes from message to message: the shop's records that match what the
// customer just asked, and past replies in a similar situation. It goes into a
// separate system block after the stable prompt, so the stable prompt stays
// cached and the customer cannot edit this text.

export function buildContext(
  knowledge: Pick<KnowledgeHit, "content">[],
  examples: Pick<ToneHit, "customerMessage" | "reply">[],
): string {
  const info =
    knowledge.length > 0
      ? knowledge.map((k) => `- ${k.content}`).join("\n")
      : "Nothing in the shop's records matched this message.";

  let context = `## Shop information\n${info}`;

  if (examples.length > 0) {
    const shown = examples
      .map((e) => `Customer: ${e.customerMessage}\nTeam: ${e.reply}`)
      .join("\n\n");
    context += `\n\n## Examples of how this shop's team replies\n${shown}`;
  }
  return context;
}
