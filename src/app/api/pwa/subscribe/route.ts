import { savePushSubscription, type PushSubscriptionPayload } from "../../../../server/pwa";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { subscription?: PushSubscriptionPayload };
    if (!body?.subscription?.endpoint) {
      return Response.json(
        { error: { code: "invalid_subscription", message: "Push subscription endpoint required." } },
        { status: 400 },
      );
    }

    const result = savePushSubscription(body.subscription);
    return Response.json(result);
  } catch (err) {
    console.error("POST /api/pwa/subscribe error:", err);
    return Response.json(
      { error: { code: "internal_error", message: "Failed to save subscription." } },
      { status: 500 },
    );
  }
}
