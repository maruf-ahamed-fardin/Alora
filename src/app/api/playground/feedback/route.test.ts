import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { migrate } from "drizzle-orm/pglite/migrator";

const dir = mkdtempSync(path.join(tmpdir(), "alora-feedback-route-test-"));
process.env.DATABASE_DIR = dir;

import { closeDb, getDb } from "../../../../db/client";
import { businesses, channels, customers } from "../../../../db/schema";
import { POST } from "./route";

let businessId: string;

before(async () => {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  [{ id: businessId }] = await getDb()
    .insert(businesses)
    .values({ slug: "demo-shop", name: "Alora Demo Shop" })
    .returning();

  const [{ id: channelId }] = await getDb()
    .insert(channels)
    .values({
      businessId,
      type: "playground",
      name: "Playground",
      externalId: "playground-demo",
    })
    .returning();

  await getDb()
    .insert(customers)
    .values({
      businessId,
      channelId,
      externalId: "local-tester",
      name: "Local Tester",
    });
});

after(async () => {
  await closeDb();
  rmSync(dir, { recursive: true, force: true });
});

test("POST /api/playground/feedback rejects invalid bodies", async () => {
  const req = new Request("http://localhost/api/playground/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ customerMessage: "" }),
  });
  const res = await POST(req);
  assert.equal(res.status, 400);
});

test("POST /api/playground/feedback saves suggested reply as tone example", async () => {
  const req = new Request("http://localhost/api/playground/feedback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      customerMessage: "vai discount hobe?",
      suggestedReply: "Ji na vaiya, amader dam shob fixed 😊",
    }),
  });
  const res = await POST(req);
  assert.equal(res.status, 200);
  const data = (await res.json()) as { success: boolean; example: { customerMessage: string; reply: string } };
  assert.equal(data.success, true);
  assert.equal(data.example.customerMessage, "vai discount hobe?");
  assert.equal(data.example.reply, "Ji na vaiya, amader dam shob fixed 😊");
});
