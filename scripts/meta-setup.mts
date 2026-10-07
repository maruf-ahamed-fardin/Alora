import { getActiveMetaChannel } from "../src/server/channels/meta";
import { closeDb } from "../src/db/client";

async function main() {
  console.log("--- Alora Meta (Messenger & Instagram) Setup & Diagnostics ---\n");

  const { channel, business } = await getActiveMetaChannel("messenger", undefined, "demo-shop");
  const creds = (channel.credentials as { pageAccessToken?: string; verifyToken?: string }) || {};

  const pageToken = creds.pageAccessToken || process.env.META_PAGE_ACCESS_TOKEN;
  const verifyToken = creds.verifyToken || process.env.META_VERIFY_TOKEN || "alora-meta-secret";
  const appSecret = process.env.META_APP_SECRET;

  console.log(`Business:     ${business.name} (${business.slug})`);
  console.log(`Channel:      ${channel.name} [ID: ${channel.id}]`);
  console.log(`Verify Token: ${verifyToken}`);
  console.log(`App Secret:   ${appSecret ? "CONFIGURED (***)" : "NOT CONFIGURED (optional)"}`);
  console.log(
    `Page Token:   ${pageToken ? pageToken.slice(0, 10) + "..." + pageToken.slice(-5) : "NOT CONFIGURED"}\n`,
  );

  if (!pageToken) {
    console.log("Tip: Add META_PAGE_ACCESS_TOKEN and META_VERIFY_TOKEN to your .env.local file.");
    console.log("You can get these from your Facebook Page settings / Meta for Developers App.\n");
  } else {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/me?fields=id,name,category,link&access_token=${encodeURIComponent(pageToken)}`,
      );
      const data = (await res.json()) as {
        id?: string;
        name?: string;
        category?: string;
        error?: { message: string };
      };

      if (data.error) {
        console.error("Meta Graph API error:", data.error.message);
      } else {
        console.log("Connected Facebook Page Identity:");
        console.log(`  Page Name: ${data.name}`);
        console.log(`  Page ID:   ${data.id}`);
        console.log(`  Category:  ${data.category ?? "N/A"}\n`);
      }
    } catch (err) {
      console.error("Failed to query Meta Graph API:", err);
    }
  }

  console.log("Webhook Setup in Meta for Developers (developers.facebook.com):");
  console.log("  1. Go to your App -> Messenger -> Webhook Setup");
  console.log("  2. Callback URL: https://<your-domain>/api/webhooks/meta");
  console.log(`  3. Verify Token: ${verifyToken}`);
  console.log("  4. Subscription Fields: check 'messages', 'messaging_postbacks'");

  await closeDb();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
