import {
  deleteTelegramWebhook,
  getActiveTelegramChannel,
  setTelegramWebhook,
  TelegramError,
} from "../../../../../server/channels/telegram";

export const dynamic = "force-dynamic";

/**
 * Configure Telegram webhook URL.
 * POST body: { url: string, secretToken?: string, action?: "set" | "delete" }
 */
export async function POST(request: Request) {
  try {
    const { channel } = await getActiveTelegramChannel("demo-shop");
    const creds = (channel.credentials as { botToken?: string; secretToken?: string }) || {};
    const botToken = creds.botToken || process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return Response.json(
        {
          error: {
            code: "missing_token",
            message: "TELEGRAM_BOT_TOKEN is not configured in .env or channel credentials.",
          },
        },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      url?: string;
      secretToken?: string;
      action?: "set" | "delete";
    };

    if (body.action === "delete") {
      const result = await deleteTelegramWebhook({ botToken });
      return Response.json(result);
    }

    const webhookUrl = body.url;
    if (!webhookUrl || !webhookUrl.startsWith("https://")) {
      return Response.json(
        {
          error: {
            code: "invalid_url",
            message: "A valid public HTTPS webhook URL is required (e.g. https://your-domain.com/api/webhooks/telegram).",
          },
        },
        { status: 400 },
      );
    }

    const secretToken = body.secretToken || creds.secretToken || process.env.TELEGRAM_WEBHOOK_SECRET;

    const result = await setTelegramWebhook({
      botToken,
      url: webhookUrl,
      secretToken,
    });

    return Response.json(result);
  } catch (err) {
    if (err instanceof TelegramError) {
      return Response.json(
        { error: { code: err.code, message: err.message } },
        { status: err.status },
      );
    }

    console.error("Telegram webhook setup error:", err);
    return Response.json(
      { error: { code: "internal", message: "Failed to setup webhook" } },
      { status: 500 },
    );
  }
}
