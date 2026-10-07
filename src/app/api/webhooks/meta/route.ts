import {
  getActiveMetaChannel,
  parseMetaWebhook,
  processMetaMessage,
  verifyMetaSignature,
  verifyMetaWebhookSubscription,
} from "../../../../server/channels/meta";

export const dynamic = "force-dynamic";

/**
 * Meta Webhook verification handshake (GET).
 * Used by Meta Dashboard to verify your webhook URL.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  // Determine expected verify token from channel credentials or env
  let expectedToken = process.env.META_VERIFY_TOKEN || "alora-meta-secret";

  try {
    const { channel } = await getActiveMetaChannel("messenger");
    const creds = (channel.credentials as { verifyToken?: string }) || {};
    if (creds.verifyToken) {
      expectedToken = creds.verifyToken;
    }
  } catch {
    // If channel not found yet, fallback to env variable
  }

  const result = verifyMetaWebhookSubscription({
    mode,
    verifyToken,
    challenge,
    expectedToken,
  });

  if (result.valid) {
    return new Response(result.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response("Forbidden: verification token mismatch", { status: 403 });
}

/**
 * Meta Webhook event handler (POST).
 * Receives messages from Facebook Messenger and Instagram Direct.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("x-hub-signature-256");
  const rawBody = await request.text();

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const appSecret = process.env.META_APP_SECRET;
  if (appSecret && !verifyMetaSignature(rawBody, signature, appSecret)) {
    return Response.json({ error: "Invalid signature" }, { status: 403 });
  }

  const messagesToProcess = parseMetaWebhook(body);
  const results = [];

  for (const msg of messagesToProcess) {
    try {
      const res = await processMetaMessage(msg);
      results.push(res);
    } catch (err) {
      console.error("Error processing Meta message:", err);
    }
  }

  // Meta expects 200 OK fast to acknowledge receipt
  return Response.json({
    ok: true,
    processed: results.length,
    results,
  });
}
