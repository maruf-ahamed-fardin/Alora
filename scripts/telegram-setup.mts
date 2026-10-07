import { getActiveTelegramChannel } from "../src/server/channels/telegram";
import { closeDb } from "../src/db/client";

async function main() {
  console.log("--- Alora Telegram Bot Setup & Diagnostics ---\n");

  const { channel, business } = await getActiveTelegramChannel("demo-shop");
  const creds = (channel.credentials as { botToken?: string; secretToken?: string }) || {};
  const token = creds.botToken || process.env.TELEGRAM_BOT_TOKEN;

  console.log(`Business: ${business.name} (${business.slug})`);
  console.log(`Channel:  ${channel.name} [ID: ${channel.id}]`);
  console.log(`Token:    ${token ? token.slice(0, 10) + "..." + token.slice(-5) : "NOT CONFIGURED"}\n`);

  if (!token) {
    console.error("Error: No bot token found!");
    console.error("Please add TELEGRAM_BOT_TOKEN to your .env or .env.local file.");
    process.exit(1);
  }

  // 1. Check Bot Identity
  try {
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData = (await meRes.json()) as {
      ok: boolean;
      result?: { id: number; first_name: string; username: string };
      description?: string;
    };

    if (!meData.ok) {
      console.error("Telegram API Error:", meData.description);
      process.exit(1);
    }

    console.log(`Bot Name:     ${meData.result?.first_name}`);
    console.log(`Bot Username: @${meData.result?.username}`);
    console.log(`Bot ID:       ${meData.result?.id}\n`);
  } catch (err) {
    console.error("Failed to connect to Telegram API:", err);
    process.exit(1);
  }

  // 2. Check Webhook Status
  try {
    const whRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
    const whData = (await whRes.json()) as {
      ok: boolean;
      result?: {
        url: string;
        has_custom_certificate: boolean;
        pending_update_count: number;
        last_error_date?: number;
        last_error_message?: string;
      };
    };

    console.log("Current Webhook Status:");
    console.log(`  URL:             ${whData.result?.url || "(none / using polling)"}`);
    console.log(`  Pending updates: ${whData.result?.pending_update_count ?? 0}`);
    if (whData.result?.last_error_message) {
      console.log(`  Last error:      ${whData.result.last_error_message}`);
    }
  } catch (err) {
    console.error("Failed to fetch webhook info:", err);
  }

  // Check if a URL was passed as argument: e.g. tsx scripts/telegram-setup.mts https://my-tunnel.ngrok.app/api/webhooks/telegram
  const argUrl = process.argv[2];
  if (argUrl && argUrl.startsWith("https://")) {
    console.log(`\nRegistering new webhook URL: ${argUrl}`);
    const setRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: argUrl,
        allowed_updates: ["message", "edited_message"],
      }),
    });
    const setData = (await setRes.json()) as { ok: boolean; description?: string };
    console.log(`Result: ${setData.ok ? "SUCCESS" : "FAILED"}`);
    if (setData.description) console.log(`Details: ${setData.description}`);
  } else if (argUrl === "--delete") {
    console.log("\nDeleting webhook...");
    const delRes = await fetch(`https://api.telegram.org/bot${token}/deleteWebhook`);
    const delData = (await delRes.json()) as { ok: boolean; description?: string };
    console.log(`Result: ${delData.ok ? "SUCCESS" : "FAILED"}`);
  } else {
    console.log("\nTip: To set webhook, run:");
    console.log("  npx tsx scripts/telegram-setup.mts https://your-domain.com/api/webhooks/telegram");
    console.log("To delete webhook, run:");
    console.log("  npx tsx scripts/telegram-setup.mts --delete");
  }

  await closeDb();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
