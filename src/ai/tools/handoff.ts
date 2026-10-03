import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { conversations, messages } from "../../db/schema";
import { requiredString, type ToolContext, type ToolDefinition } from "./types";

export function handoffTool({ businessId, conversationId }: ToolContext): ToolDefinition {
  return {
    name: "handoff_to_agent",
    description:
      "Hand this conversation to a human team member. Use it when the customer is upset, has a complaint, wants a refund, asks for a person, or asks something you cannot answer with your tools. After it succeeds the AI stops replying in this conversation, so tell the customer in your reply that a team member will take over.",
    inputSchema: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "One short sentence for the team: why this needs a person.",
        },
      },
      required: ["reason"],
    },
    async run(input) {
      const reason = requiredString(input, "reason");
      const db = getDb();
      const mine = and(
        eq(conversations.businessId, businessId),
        eq(conversations.id, conversationId),
      );

      const [current] = await db
        .select({ status: conversations.status })
        .from(conversations)
        .where(mine);
      if (!current) return { ok: false, note: "Conversation not found." };
      // Already handed over: do not post a second note for the team.
      if (current.status === "handoff") {
        return {
          ok: true,
          alreadyHandedOver: true,
          note: "A team member has already been asked to take over.",
        };
      }

      await db.update(conversations).set({ status: "handoff", aiEnabled: false }).where(mine);
      await db.insert(messages).values({
        businessId,
        conversationId,
        sender: "system",
        content: `Handed over to a team member. Reason: ${reason}`,
        metadata: { handoff: true },
      });
      return { ok: true, note: "A team member has been notified and will take over this chat." };
    },
  };
}
