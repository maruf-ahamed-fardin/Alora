import {
  getActiveTelegramChannel,
  getTelegramWebhookInfo,
  processTelegramUpdate,
  TelegramError,
} from "../../../../server/channels/telegram";

export const dynamic = "force-dynamic";

/**
 * Health check & status endpoint for Telegram bot integration.
 */
export async function GET() {
  try {
    const { business, channel } = await getActiveTelegramChannel("demo-shop");
    const creds = (channel.credentials as { botToken?: string }) || {};
    const botToken = creds.botToken || process.env.TELEGRAM_BOT_TOKEN;

    let webhookInfo: unknown = null;
    if (botToken) {
      try {
        webhookInfo = await getTelegramWebhookInfo({ botToken });
      } catch (err) {
        console.warn("Could not query Telegram webhook info:", err);
      }
    }

    return Response.json({
      configured: Boolean(botToken),
      channel: {
        id: channel.id,
        name: channel.name,
        type: channel.type,
        isActive: channel.isActive,
      },
      business: {
        id: business.id,
        slug: business.slug,
        name: business.name,
      },
      webhookInfo,
    });
  } catch (err) {
    if (err instanceof TelegramError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status },
      );
    }
    return Response.json(
      { error: { code: "internal", message: "Failed to load Telegram status" } },
      { status: 500 },
    );
  }
}

/**
 * Incoming webhook receiver for Telegram Bot updates.
 */
export async function POST(request: Request) {
  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");

  let update: unknown;
  try {
    update = await request.json();
  } catch {
    return Response.json(
      { error: { code: "invalid_json", message: "Expected JSON payload" } },
      { status: 400 },
    );
  }

  try {
    const result = await processTelegramUpdate(update, secretHeader);
    return Response.json({ ok: true, result });
  } catch (err) {
    if (err instanceof TelegramError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status },
      );
    }

    console.error("Telegram webhook error:", err);
    // Return 200 or 500? Telegram retries on 5xx; returning 500 is okay for temporary failures,
    // but returning ok: false with 200 prevents infinite retry loops on application errors.
    return Response.json(
      { ok: false, error: "Internal processing error" },
      { status: 200 },
    );
  }
}
