import { and, eq, sql } from "drizzle-orm";
import { closeDb, getDb, getPg } from "../src/db/client";
import {
  businesses,
  channels,
  conversations,
  customers,
  deliveryZones,
  knowledgeChunks,
  knowledgeDocuments,
  messages,
  orders,
  products,
  toneExamples,
} from "../src/db/schema";

// Health check for the local database. Every test that writes runs inside a
// transaction that is rolled back, so the seeded data is never touched.

const db = getDb();
const pg = getPg();

const ROLLBACK = Symbol("rollback");
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

let failures = 0;
function report(ok: boolean, name: string, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function rolledBack(fn: (tx: Tx) => Promise<void>) {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
}

// The database must refuse this write. Returns the reason it gave.
async function mustBeRejected(name: string, fn: (tx: Tx) => Promise<void>) {
  try {
    await rolledBack(fn);
    report(false, name, "database accepted it");
  } catch (err) {
    const cause = (err as { cause?: { message?: string } }).cause;
    report(true, name, cause?.message ?? "rejected");
  }
}

const tables = await pg.query<{ table_name: string }>(
  `select table_name from information_schema.tables
   where table_schema = 'public' and table_name not like '\\_\\_%'
   order by table_name`,
);
report(
  tables.rows.length === 11,
  "11 tables exist",
  tables.rows.map((r) => r.table_name).join(", "),
);

const ext = await pg.query<{ extname: string }>(
  "select extname from pg_extension where extname = 'vector'",
);
report(ext.rows.length === 1, "pgvector extension enabled");
const near = await pg.query<{ id: number }>(
  `select id from (values (1, '[1,0,0]'::vector), (2, '[0,1,0]'::vector)) v(id, e)
   order by e <=> '[1,0.1,0]' limit 1`,
);
report(near.rows[0]?.id === 1, "vector similarity search works");

const [demo] = await db
  .select()
  .from(businesses)
  .where(eq(businesses.slug, "demo-shop"));
report(Boolean(demo), "seeded business 'demo-shop' exists");

if (demo) {
  const [{ count: productCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(products)
    .where(eq(products.businessId, demo.id));
  const [{ count: docCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.businessId, demo.id));
  report(productCount === 5, "5 products seeded", `found ${productCount}`);
  report(docCount === 5, "5 knowledge documents seeded", `found ${docCount}`);

  const [{ count: zoneCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deliveryZones)
    .where(eq(deliveryZones.businessId, demo.id));
  const [{ count: orderCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(orders)
    .where(eq(orders.businessId, demo.id));
  report(zoneCount === 2, "2 delivery zones seeded", `found ${zoneCount}`);
  report(orderCount === 3, "3 orders seeded", `found ${orderCount}`);

  const [channel] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.businessId, demo.id), eq(channels.type, "playground")));
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.businessId, demo.id), eq(customers.externalId, "local-tester")));
  report(Boolean(channel && customer), "playground channel and tester customer exist");

  if (channel && customer) {
    await rolledBack(async (tx) => {
      const [conv] = await tx
        .insert(conversations)
        .values({
          businessId: demo.id,
          customerId: customer.id,
          channelId: channel.id,
        })
        .returning();
      await tx.insert(messages).values({
        businessId: demo.id,
        conversationId: conv.id,
        sender: "customer",
        content: "vai black tshirt ache?",
        externalId: "m1",
      });
      const rows = await tx
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conv.id));
      report(
        rows.length === 1 && rows[0].content === "vai black tshirt ache?",
        "can store and read a conversation message (Banglish text)",
      );
    });

    const unit = (i: number) =>
      Array.from({ length: 384 }, (_, k) => (k === i ? 1 : 0));
    const [doc] = await db
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.businessId, demo.id))
      .limit(1);

    await rolledBack(async (tx) => {
      await tx.insert(knowledgeChunks).values({
        businessId: demo.id,
        documentId: doc.id,
        chunkIndex: 99,
        content: "test",
        embedding: unit(0),
        embeddingModel: "test",
      });
      await tx.insert(toneExamples).values({
        businessId: demo.id,
        customerMessage: "hi",
        reply: "hello",
        embedding: unit(1),
        embeddingModel: "test",
      });
      const nearest = await tx.execute(
        sql`select content from knowledge_chunks where chunk_index = 99 order by embedding <=> ${JSON.stringify(unit(0))}::vector limit 1`,
      );
      report(
        (nearest.rows[0] as { content: string } | undefined)?.content === "test",
        "384-dimension vectors can be stored and searched",
      );
    });

    await mustBeRejected(
      "another business cannot attach a chunk to this business's document",
      async (tx) => {
        const [other] = await tx
          .insert(businesses)
          .values({ slug: "other-shop", name: "Other Shop" })
          .returning();
        await tx.insert(knowledgeChunks).values({
          businessId: other.id,
          documentId: doc.id,
          chunkIndex: 0,
          content: "leak",
          embedding: unit(2),
          embeddingModel: "test",
        });
      },
    );

    await mustBeRejected(
      "duplicate webhook message (same external id) is rejected",
      async (tx) => {
        const [conv] = await tx
          .insert(conversations)
          .values({
            businessId: demo.id,
            customerId: customer.id,
            channelId: channel.id,
          })
          .returning();
        const row = {
          businessId: demo.id,
          conversationId: conv.id,
          sender: "customer" as const,
          content: "hi",
          externalId: "dup-1",
        };
        await tx.insert(messages).values(row);
        await tx.insert(messages).values(row);
      },
    );

    await mustBeRejected(
      "another business cannot open a conversation with this business's customer",
      async (tx) => {
        const [other] = await tx
          .insert(businesses)
          .values({ slug: "other-shop", name: "Other Shop" })
          .returning();
        await tx.insert(conversations).values({
          businessId: other.id,
          customerId: customer.id,
          channelId: channel.id,
        });
      },
    );

    await mustBeRejected(
      "another business cannot add a message to this business's conversation",
      async (tx) => {
        const [conv] = await tx
          .insert(conversations)
          .values({
            businessId: demo.id,
            customerId: customer.id,
            channelId: channel.id,
          })
          .returning();
        const [other] = await tx
          .insert(businesses)
          .values({ slug: "other-shop", name: "Other Shop" })
          .returning();
        await tx.insert(messages).values({
          businessId: other.id,
          conversationId: conv.id,
          sender: "customer",
          content: "leak?",
        });
      },
    );

    await mustBeRejected(
      "another business cannot attach an order to this business's customer",
      async (tx) => {
        const [other] = await tx
          .insert(businesses)
          .values({ slug: "other-shop", name: "Other Shop" })
          .returning();
        await tx.insert(orders).values({
          businessId: other.id,
          orderNumber: "ORD-LEAK",
          customerId: customer.id,
          subtotal: "1",
          total: "1",
        });
      },
    );

    await mustBeRejected(
      "a business cannot have two default delivery zones",
      async (tx) => {
        const zone = {
          businessId: demo.id,
          keywords: [],
          isDefault: true,
          charge: "100",
          minDays: 1,
          maxDays: 2,
        };
        await tx.insert(deliveryZones).values({ ...zone, name: "Probe A" });
        await tx.insert(deliveryZones).values({ ...zone, name: "Probe B" });
      },
    );

    await rolledBack(async (tx) => {
      const [other] = await tx
        .insert(businesses)
        .values({ slug: "other-shop", name: "Other Shop" })
        .returning();
      const visible = await tx
        .select()
        .from(products)
        .where(eq(products.businessId, other.id));
      report(visible.length === 0, "a new business sees none of the demo products");
    });
  }
}

await closeDb();
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
