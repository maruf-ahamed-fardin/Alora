import { eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { businesses } from "../src/db/schema";
import { createEmbedder } from "../src/knowledge/embedder";
import { EVAL_CASES, type Lang } from "../src/knowledge/eval-cases";
import { searchKnowledge } from "../src/knowledge/retrieval";

// Does the right document come back for real customer questions?
// Needs `npm run kb:index` first.

const [business] = await getDb().select().from(businesses).where(eq(businesses.slug, "demo-shop"));
if (!business) throw new Error("Demo shop not found. Run `npm run db:reset`.");

const embedder = createEmbedder();
const langs: Lang[] = ["bangla", "banglish", "english"];
const tally = Object.fromEntries(langs.map((l) => [l, { n: 0, top1: 0, top3: 0 }]));
const misses: string[] = [];

for (const c of EVAL_CASES) {
  const hits = await searchKnowledge(business.id, c.query, embedder, 3);
  const rank = hits.findIndex((h) => h.kind === c.expect);
  const t = tally[c.lang];
  t.n++;
  if (rank === 0) t.top1++;
  if (rank >= 0) t.top3++;
  if (rank !== 0) {
    misses.push(
      `${rank < 0 ? "MISS " : "rank " + (rank + 1)}  [${c.lang}] "${c.query}" wanted ${c.expect}, got ${hits.map((h) => h.kind).join(", ")}`,
    );
  }
}

const pct = (a: number, n: number) => `${a}/${n} (${Math.round((100 * a) / n)}%)`;
console.log(`model: ${embedder.model}\n`);
console.log("language    top-1 correct     correct in top-3");
let all = { n: 0, top1: 0, top3: 0 };
for (const l of langs) {
  const t = tally[l];
  console.log(`${l.padEnd(10)}  ${pct(t.top1, t.n).padEnd(16)}  ${pct(t.top3, t.n)}`);
  all = { n: all.n + t.n, top1: all.top1 + t.top1, top3: all.top3 + t.top3 };
}
console.log(`${"all".padEnd(10)}  ${pct(all.top1, all.n).padEnd(16)}  ${pct(all.top3, all.n)}`);
if (misses.length) console.log(`\nNot first:\n${misses.join("\n")}`);

await closeDb();

// A regression gate: the model sees the top 3 chunks, so that is what must hold.
const MIN_TOP3 = 0.9;
if (all.top3 / all.n < MIN_TOP3) {
  console.error(`FAILED: top-3 is below ${MIN_TOP3 * 100}%.`);
  process.exit(1);
}
