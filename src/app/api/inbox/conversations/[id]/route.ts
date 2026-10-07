import {
  getConversationDetails,
  getInboxBusiness,
  listConversationMessages,
  toggleAi,
  updateConversationStatus,
  InboxError,
  type ConversationStatus,
} from "../../../../../server/inbox";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Params) {
  try {
    const { id: conversationId } = await context.params;
    const business = await getInboxBusiness();
    const conversation = await getConversationDetails(business.id, conversationId);
    const thread = await listConversationMessages(business.id, conversationId);

    return Response.json({
      conversation,
      messages: thread,
    });
  } catch (err) {
    if (err instanceof InboxError) {
      return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    console.error("GET /api/inbox/conversations/[id] error", err);
    return Response.json({ error: { code: "internal_error", message: "Failed to load conversation." } }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: Params) {
  try {
    const { id: conversationId } = await context.params;
    const business = await getInboxBusiness();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: { code: "bad_json", message: "Invalid JSON body." } }, { status: 400 });
    }

    const { aiEnabled, status } = (body ?? {}) as {
      aiEnabled?: unknown;
      status?: unknown;
    };

    if (typeof aiEnabled === "boolean") {
      const result = await toggleAi(business.id, conversationId, aiEnabled);
      return Response.json(result);
    }

    if (typeof status === "string") {
      const result = await updateConversationStatus(
        business.id,
        conversationId,
        status as ConversationStatus,
      );
      return Response.json(result);
    }

    return Response.json(
      { error: { code: "invalid_request", message: "Provide either aiEnabled or status." } },
      { status: 400 },
    );
  } catch (err) {
    if (err instanceof InboxError) {
      return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    console.error("PATCH /api/inbox/conversations/[id] error", err);
    return Response.json({ error: { code: "internal_error", message: "Failed to update conversation." } }, { status: 500 });
  }
}
