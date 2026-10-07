import { getInboxBusiness, listInboxConversations, InboxError } from "../../../../server/inbox";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? undefined;
    const channel = url.searchParams.get("channel") ?? undefined;
    const search = url.searchParams.get("search") ?? undefined;

    const business = await getInboxBusiness();
    const conversations = await listInboxConversations(business.id, {
      status,
      channel,
      search,
    });

    return Response.json({
      business: { id: business.id, name: business.name },
      conversations,
    });
  } catch (err) {
    if (err instanceof InboxError) {
      return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
    }
    console.error("GET /api/inbox/conversations error", err);
    return Response.json({ error: { code: "internal_error", message: "Failed to list conversations." } }, { status: 500 });
  }
}
