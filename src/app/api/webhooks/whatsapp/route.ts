import {
  getActiveWhatsAppChannel,
  parseWhatsAppWebhook,
  processWhatsAppMessage,
  verifyWhatsAppWebhook,
} from "../../../../server/channels/whatsapp";

export const dynamic = "force-dynamic";

/**
 * WhatsApp Cloud API Webhook handshake (GET).
 * Used by Meta WhatsApp Business App to verify your webhook URL.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const verifyToken = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  let expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || "alora-whatsapp-secret";

  try {
    const { channel } = await getActiveWhatsAppChannel();
    const creds = (channel.credentials as { verifyToken?: string }) || {};
    if (creds.verifyToken) {
      expectedToken = creds.verifyToken;
    }
  } catch {
    // If channel not seeded, fallback to env variable
  }

  const result = verifyWhatsAppWebhook({
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

  return new Response("Forbidden: WhatsApp verification token mismatch", { status: 403 });
}

/**
 * WhatsApp Cloud API Webhook event receiver (POST).
 * Receives incoming customer messages from WhatsApp.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messagesToProcess = parseWhatsAppWebhook(body);
  const results = [];

  for (const msg of messagesToProcess) {
    try {
      const res = await processWhatsAppMessage(msg);
      results.push(res);
    } catch (err) {
      console.error("Error processing WhatsApp message:", err);
    }
  }

  // Meta requires a fast 200 OK response
  return Response.json({
    ok: true,
    processed: results.length,
    results,
  });
}
