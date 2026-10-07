import {
  getInboxBusiness,
  sendAgentMessage,
  simulateIncomingCustomerMessage,
  InboxError,
} from "../../../../../../server/inbox";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Params) {
  try {
    const { id: conversationId } = await context.params;
    const business = await getInboxBusiness();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { error: { code: "bad_json", message: "Invalid JSON body." } },
        { status: 400 },
      );
    }

    const { content, sender } = (body ?? {}) as {
      content?: unknown;
      sender?: unknown;
    };

    if (typeof content !== "string" || !content.trim()) {
      return Response.json(
        { error: { code: "empty_content", message: "Content cannot be empty." } },
        { status: 400 },
      );
    }

    if (sender === "customer") {
      const result = await simulateIncomingCustomerMessage(
        business.id,
        conversationId,
        content.trim(),
      );
      return Response.json({ success: true, ...result });
    }

    const message = await sendAgentMessage(
      business.id,
      conversationId,
      content.trim(),
    );

    return Response.json({ success: true, message });
  } catch (err) {
    if (err instanceof InboxError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status },
      );
    }
    console.error("POST /api/inbox/conversations/[id]/messages error", err);
    return Response.json(
      { error: { code: "internal_error", message: "Failed to send message." } },
      { status: 500 },
    );
  }
}
