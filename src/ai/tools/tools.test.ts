import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";

// Each test file runs in its own process; give it a throwaway database.
const dir = mkdtempSync(path.join(tmpdir(), "alora-tools-test-"));
process.env.DATABASE_DIR = dir;

import { closeDb, getDb } from "../../db/client";
import {
  businesses,
  channels,
  conversations,
  customers,
  deliveryZones,
  messages,
  orders,
  products,
} from "../../db/schema";
import { buildTools, ToolInputError, type ToolDefinition } from "./index";

let businessId: string;
let otherBusinessId: string;
let conversationId: string;
let customerId: string;
let tools: ToolDefinition[];

const tool = (name: string) => {
  const found = tools.find((t) => t.name === name);
  assert.ok(found, `tool ${name} exists`);
  return found;
};

before(async () => {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
  const db = getDb();

  const [shop] = await db.insert(businesses).values({ slug: "shop", name: "Shop" }).returning();
  const [rival] = await db.insert(businesses).values({ slug: "rival", name: "Rival" }).returning();
  businessId = shop.id;
  otherBusinessId = rival.id;

  const [channel] = await db
    .insert(channels)
    .values({ businessId, type: "playground", name: "p" })
    .returning();
  const [me, stranger] = await db
    .insert(customers)
    .values([
      { businessId, channelId: channel.id, externalId: "me" },
      { businessId, channelId: channel.id, externalId: "stranger" },
    ])
    .returning();
  customerId = me.id;
  const [conversation] = await db
    .insert(conversations)
    .values({ businessId, channelId: channel.id, customerId })
    .returning();
  conversationId = conversation.id;

  await db.insert(products).values([
    {
      businessId,
      sku: "TS-BLK-001",
      name: "Black T-shirt",
      price: "1300.00",
      stockQuantity: 12,
      attributes: { color: "Black", sizes: { M: 5, L: 4, XL: 3 } },
    },
    {
      businessId,
      sku: "TS-WHT-001",
      name: "White T-shirt",
      price: "1250.00",
      stockQuantity: 5,
      attributes: { color: "White", sizes: { M: 3, L: 0, XL: 2 } },
    },
    {
      businessId,
      sku: "HD-NVY-001",
      name: "Navy Hoodie",
      price: "2400.00",
      stockQuantity: 0,
      attributes: { color: "Navy", sizes: { M: 0, L: 0 } },
    },
    {
      businessId,
      sku: "CAP-001",
      name: "Plain Cap",
      price: "400.00",
      stockQuantity: 7,
    },
    {
      businessId,
      sku: "OLD-001",
      name: "Retired Jacket",
      price: "5000.00",
      stockQuantity: 9,
      isActive: false,
    },
    // Another business's product: must never show up for this shop.
    { businessId: otherBusinessId, sku: "RIV-001", name: "Rival Black T-shirt", price: "1.00", stockQuantity: 99 },
  ]);

  await db.insert(deliveryZones).values([
    {
      businessId,
      name: "Inside Dhaka",
      keywords: ["dhaka", "ঢাকা", "dhanmondi"],
      charge: "60.00",
      minDays: 2,
      maxDays: 3,
      freeAbove: "3000.00",
    },
    { businessId, name: "Outside Dhaka", isDefault: true, charge: "120.00", minDays: 3, maxDays: 5 },
  ]);

  const order = (orderNumber: string, owner: string, extra: Partial<typeof orders.$inferInsert> = {}) => ({
    businessId,
    orderNumber,
    customerId: owner,
    subtotal: "1000.00",
    total: "1060.00",
    deliveryCharge: "60.00",
    ...extra,
  });
  await db.insert(orders).values([
    order("ORD-1001", me.id, {
      status: "shipped",
      courier: "Pathao",
      trackingCode: "PT-1",
      placedAt: new Date("2026-10-01T00:00:00Z"),
    }),
    order("ORD-1002", me.id, { status: "pending", placedAt: new Date("2026-10-03T00:00:00Z") }),
    order("ORD-2001", stranger.id, { status: "confirmed" }),
  ]);

  tools = buildTools({ businessId, conversationId, customerId });
});

after(async () => {
  await closeDb();
  rmSync(dir, { recursive: true, force: true });
});

type Out = Record<string, unknown>;
const run = async (name: string, input: unknown) => (await tool(name).run(input)) as Out;

test("the five tools exist, each with a description and an input schema", () => {
  assert.deepEqual(
    tools.map((t) => t.name),
    ["get_product", "check_stock", "get_delivery_charge", "get_order", "handoff_to_agent"],
  );
  for (const t of tools) {
    assert.ok(t.description.length > 40, `${t.name} describes itself`);
    assert.equal(t.inputSchema.type, "object");
  }
});

// --- get_product -------------------------------------------------------------

test("get_product finds a product however the customer spells it and returns the real price", async () => {
  for (const query of ["black tshirt", "Black T-shirt", "black t shirt", "TS-BLK-001"]) {
    const out = await run("get_product", { query });
    const found = out.products as Out[];
    assert.equal(found[0].name, "Black T-shirt", query);
    assert.equal(found[0].price, 1300, query);
  }
});

test("get_product reports stock and sizes honestly", async () => {
  const [hoodie] = (await run("get_product", { query: "hoodie" })).products as Out[];
  assert.equal(hoodie.inStock, false);
  assert.equal(hoodie.unitsLeft, 0);
  const [white] = (await run("get_product", { query: "white" })).products as Out[];
  assert.deepEqual(white.sizes, { M: 3, L: 0, XL: 2 });
});

test("get_product says so when nothing matches, and never lists inactive products", async () => {
  const none = await run("get_product", { query: "gift wrap" });
  assert.deepEqual(none.products, []);
  assert.ok(none.note);
  const retired = await run("get_product", { query: "retired jacket" });
  assert.deepEqual(retired.products, []);
});

test("get_product ignores very short words and never returns another shop's products", async () => {
  const out = await run("get_product", { query: "black tshirt er dam ta" });
  const names = (out.products as Out[]).map((p) => p.name);
  assert.deepEqual(names, ["Black T-shirt", "White T-shirt"]);
  assert.ok(!names.includes("Rival Black T-shirt"));
});

test("get_product with no query lists products", async () => {
  const out = await run("get_product", {});
  assert.equal(out.listedWithoutQuery, true);
  assert.ok((out.products as Out[]).length > 0);
});

// --- check_stock -------------------------------------------------------------

test("check_stock answers per size, including sold-out and missing sizes", async () => {
  const inStock = await run("check_stock", { product: "black tshirt", size: "l" });
  assert.equal(inStock.available, true);
  assert.equal(inStock.unitsLeft, 4);
  assert.equal(inStock.size, "L");

  const soldOut = await run("check_stock", { product: "TS-WHT-001", size: "L" });
  assert.equal(soldOut.available, false);
  assert.equal(soldOut.unitsLeft, 0);
  assert.deepEqual(soldOut.availableSizes, ["M", "XL"]);

  const missing = await run("check_stock", { product: "black tshirt", size: "XXL" });
  assert.equal(missing.sizeOffered, false);
  assert.equal(missing.available, false);
});

test("check_stock without a size, for a sold-out product and for one without sizes", async () => {
  const hoodie = await run("check_stock", { product: "hoodie" });
  assert.equal(hoodie.available, false);
  const cap = await run("check_stock", { product: "cap", size: "L" });
  assert.equal(cap.available, true);
  assert.equal(cap.unitsLeft, 7);
});

test("check_stock asks for clarification when two products match equally", async () => {
  const out = await run("check_stock", { product: "t-shirt", size: "M" });
  assert.equal(out.ambiguous, true);
  assert.equal((out.candidates as Out[]).length, 2);
});

test("check_stock for an unknown product, and a missing product name", async () => {
  assert.equal((await run("check_stock", { product: "laptop" })).found, false);
  await assert.rejects(tool("check_stock").run({}), ToolInputError);
  await assert.rejects(tool("check_stock").run({ product: 5 }), ToolInputError);
});

// --- get_delivery_charge -----------------------------------------------------

test("get_delivery_charge matches a zone by keyword in English or Bangla", async () => {
  for (const area of ["Dhaka", "Dhanmondi 27", "ঢাকার ভিতরে"]) {
    const out = await run("get_delivery_charge", { area });
    assert.equal(out.zone, "Inside Dhaka", area);
    assert.equal(out.charge, 60, area);
    assert.equal(out.minDays, 2);
    assert.equal(out.maxDays, 3);
  }
});

test("get_delivery_charge falls back to the default zone and says it did", async () => {
  const out = await run("get_delivery_charge", { area: "Sylhet" });
  assert.equal(out.zone, "Outside Dhaka");
  assert.equal(out.charge, 120);
  assert.ok(out.note);
});

test("get_delivery_charge applies free delivery only above the threshold, and only where one is set", async () => {
  const above = await run("get_delivery_charge", { area: "Dhaka", order_total: 3500 });
  assert.equal(above.charge, 0);
  assert.equal(above.freeDelivery, true);

  const exactly = await run("get_delivery_charge", { area: "Dhaka", order_total: 3000 });
  assert.equal(exactly.charge, 60);

  const unknownTotal = await run("get_delivery_charge", { area: "Dhaka" });
  assert.equal(unknownTotal.charge, 60);
  assert.equal(unknownTotal.freeDeliveryAbove, 3000);

  const outside = await run("get_delivery_charge", { area: "Sylhet", order_total: 9000 });
  assert.equal(outside.charge, 120);
});

test("get_delivery_charge rejects bad input and never reads another shop's zones", async () => {
  await assert.rejects(tool("get_delivery_charge").run({}), ToolInputError);
  await assert.rejects(tool("get_delivery_charge").run({ area: "Dhaka", order_total: -5 }), ToolInputError);

  const rivalTools = buildTools({ businessId: otherBusinessId, conversationId, customerId });
  const rival = (await rivalTools[2].run({ area: "Dhaka" })) as Out;
  assert.equal(rival.found, false);
});

// --- get_order ---------------------------------------------------------------

test("get_order finds the customer's order by number, with or without the prefix", async () => {
  for (const order_number of ["ORD-1001", "ord 1001", "1001"]) {
    const out = await run("get_order", { order_number });
    const [order] = out.orders as Out[];
    assert.equal(order.orderNumber, "ORD-1001", order_number);
    assert.equal(order.status, "shipped");
    assert.equal(order.courier, "Pathao");
    assert.equal(order.trackingCode, "PT-1");
    assert.equal(order.total, 1060);
  }
});

test("get_order never shows another customer's order, and says the same as for a missing one", async () => {
  const theirs = await run("get_order", { order_number: "ORD-2001" });
  const missing = await run("get_order", { order_number: "ORD-9999" });
  assert.deepEqual(theirs.orders, []);
  assert.deepEqual(theirs, missing);
});

test("get_order without a number returns the customer's recent orders, newest first", async () => {
  const out = await run("get_order", {});
  assert.deepEqual(
    (out.orders as Out[]).map((o) => o.orderNumber),
    ["ORD-1002", "ORD-1001"],
  );
});

test("get_order for a customer with no orders", async () => {
  const [other] = await getDb().select().from(customers).where(eq(customers.externalId, "stranger"));
  const strangerTools = buildTools({ businessId, conversationId, customerId: other.id });
  const own = (await strangerTools[3].run({ order_number: "ORD-1001" })) as Out;
  assert.deepEqual(own.orders, [], "the stranger cannot see the first customer's order");
  const theirs = (await strangerTools[3].run({})) as Out;
  assert.deepEqual((theirs.orders as Out[]).map((o) => o.orderNumber), ["ORD-2001"]);
});

// --- handoff_to_agent --------------------------------------------------------

test("handoff_to_agent switches the AI off, marks the chat and leaves a note for the team", async () => {
  const out = await run("handoff_to_agent", { reason: "Customer wants a refund" });
  assert.equal(out.ok, true);

  const [conversation] = await getDb()
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  assert.equal(conversation.status, "handoff");
  assert.equal(conversation.aiEnabled, false);

  const notes = (await getDb().select().from(messages).where(eq(messages.conversationId, conversationId))).filter(
    (m) => m.sender === "system",
  );
  assert.equal(notes.length, 1);
  assert.match(notes[0].content, /Customer wants a refund/);
});

test("handoff_to_agent twice leaves only one note, and a reason is required", async () => {
  const again = await run("handoff_to_agent", { reason: "still angry" });
  assert.equal(again.alreadyHandedOver, true);
  const notes = (await getDb().select().from(messages).where(eq(messages.conversationId, conversationId))).filter(
    (m) => m.sender === "system",
  );
  assert.equal(notes.length, 1);
  await assert.rejects(tool("handoff_to_agent").run({}), ToolInputError);
});

test("handoff_to_agent cannot touch another business's conversation", async () => {
  const rivalTools = buildTools({ businessId: otherBusinessId, conversationId, customerId });
  const out = (await rivalTools[4].run({ reason: "x" })) as Out;
  assert.equal(out.ok, false);
});
