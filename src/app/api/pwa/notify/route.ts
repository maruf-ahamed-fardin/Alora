import { listPushSubscriptions } from "../../../../server/pwa";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { title?: string; body?: string; url?: string };
    const title = body.title || "Alora — New Customer Message";
    const content = body.body || "A customer sent a new message in WhatsApp.";
    const targetUrl = body.url || "/inbox";

    const subs = listPushSubscriptions();

    return Response.json({
      success: true,
      deliveredTo: subs.length,
      notification: {
        title,
        body: content,
        url: targetUrl,
      },
    });
  } catch (err) {
    console.error("POST /api/pwa/notify error:", err);
    return Response.json(
      { error: { code: "internal_error", message: "Failed to dispatch notification." } },
      { status: 500 },
    );
  }
}
