import { and, eq, sql } from "drizzle-orm";
import { db, pg } from "../src/db/client";
import {
  businesses,
  channels,
  conversations,
  customers,
  knowledgeDocuments,
  messages,
  products,
} from "../src/db/schema";

// Health check for the local database. Every test that writes runs inside a
// transaction that is rolled back, so the seeded data is never touched.

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
  tables.rows.length === 7,
  "7 tables exist",
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

  const [channel] = await db
    .select()
    .from(channels)
    .where(and(eq(channels.businessId, demo.id), eq(channels.type, "playground")));
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.businessId, demo.id));
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

await pg.close();
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
