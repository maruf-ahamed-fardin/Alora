import { getActiveWhatsAppChannel } from "../src/server/channels/whatsapp";
import { closeDb } from "../src/db/client";

async function main() {
  console.log("--- Alora WhatsApp Cloud API Setup & Diagnostics ---\n");

  const { channel, business } = await getActiveWhatsAppChannel(undefined, "demo-shop");
  const creds =
    (channel.credentials as {
      accessToken?: string;
      phoneNumberId?: string;
      verifyToken?: string;
    }) || {};

  const token = creds.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = creds.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || channel.externalId;
  const verifyToken = creds.verifyToken || process.env.WHATSAPP_VERIFY_TOKEN || "alora-whatsapp-secret";

  console.log(`Business:        ${business.name} (${business.slug})`);
  console.log(`Channel:         ${channel.name} [ID: ${channel.id}]`);
  console.log(`Phone Number ID: ${phoneId || "NOT CONFIGURED"}`);
  console.log(`Verify Token:    ${verifyToken}`);
  console.log(
    `Access Token:    ${token ? token.slice(0, 10) + "..." + token.slice(-5) : "NOT CONFIGURED"}\n`,
  );

  if (!token || !phoneId) {
    console.log("Tip: Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID to your .env.local file.");
    console.log("You can get these from your Meta Developer App -> WhatsApp -> API Setup.\n");
  } else {
    try {
      const res = await fetch(
        `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}?fields=verified_name,display_phone_number,quality_rating,code_verification_status`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = (await res.json()) as {
        verified_name?: string;
        display_phone_number?: string;
        quality_rating?: string;
        code_verification_status?: string;
        error?: { message: string };
      };

      if (data.error) {
        console.error("WhatsApp Cloud API error:", data.error.message);
      } else {
        console.log("Connected WhatsApp Business Phone Number:");
        console.log(`  Display Number:   ${data.display_phone_number}`);
        console.log(`  Verified Name:    ${data.verified_name || "N/A"}`);
        console.log(`  Quality Rating:   ${data.quality_rating || "UNKNOWN"}`);
        console.log(`  Verification:     ${data.code_verification_status || "VERIFIED"}\n`);
      }
    } catch (err) {
      console.error("Failed to query WhatsApp Cloud API:", err);
    }
  }

  console.log("Webhook Setup in Meta for Developers (developers.facebook.com):");
  console.log("  1. Go to your App -> WhatsApp -> Configuration");
  console.log("  2. Callback URL: https://<your-domain>/api/webhooks/whatsapp");
  console.log(`  3. Verify Token: ${verifyToken}`);
  console.log("  4. Webhook fields: check 'messages'");

  await closeDb();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
