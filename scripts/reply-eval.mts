import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { channels, conversations, customers } from "../src/db/schema";
import { handleCustomerMessage } from "../src/ai/engine";
import { createChatModel, isAiConfigured } from "../src/ai/factory";
import { createEmbedder } from "../src/knowledge/embedder";
import {
  REPLY_EVAL_CASES,
  type ReplyEvalCase,
} from "../src/ai/reply-eval-cases";
import {
  getPlaygroundBusiness,
  PLAYGROUND_CUSTOMER_EXTERNAL_ID,
} from "../src/server/playground";

// Alora D5 Reply Evaluation & Regression Suite
// Checks rhythm, tone, facts, tool selection, and script mirroring.
// Run with: `npm run reply:eval` or `npm run reply:eval -- --sample 5`

const args = process.argv.slice(2);
const sampleArgIdx = args.indexOf("--sample");
const sampleCount = sampleArgIdx !== -1 ? parseInt(args[sampleArgIdx + 1], 10) : undefined;
const catArgIdx = args.indexOf("--category");
const targetCategory = catArgIdx !== -1 ? args[catArgIdx + 1] : undefined;
const idArgIdx = args.indexOf("--id");
const targetId = idArgIdx !== -1 ? args[idArgIdx + 1] : undefined;

let selectedCases: ReplyEvalCase[] = REPLY_EVAL_CASES;

if (targetId) {
  selectedCases = selectedCases.filter((c) => c.id === targetId);
} else if (targetCategory) {
  selectedCases = selectedCases.filter((c) => c.category === targetCategory);
}

if (sampleCount && sampleCount > 0) {
  selectedCases = selectedCases.slice(0, sampleCount);
}

console.log(`\n========================================`);
console.log(` Alora D5 Reply Evaluation & Regression `);
console.log(`========================================\n`);

const business = await getPlaygroundBusiness();
const db = getDb();

const [channel] = await db
  .select()
  .from(channels)
  .where(
    and(eq(channels.businessId, business.id), eq(channels.type, "playground")),
  );

const [customer] = await db
  .select()
  .from(customers)
  .where(
    and(
      eq(customers.businessId, business.id),
      eq(customers.externalId, PLAYGROUND_CUSTOMER_EXTERNAL_ID),
    ),
  );

if (!channel || !customer) {
  console.error("Playground channel or test customer missing. Run `npm run db:reset` first.");
  await closeDb();
  process.exit(1);
}

const aiActive = isAiConfigured();

if (!aiActive) {
  console.log("ℹ️  AI model is NOT configured (no ANTHROPIC_API_KEY or AI_PROVIDER=ollama in .env.local).");
  console.log("   Running structural check on eval cases instead...\n");

  const categories = new Set(selectedCases.map((c) => c.category));
  const languages = new Set(selectedCases.map((c) => c.lang));

  console.log(`Total Cases: ${selectedCases.length}`);
  console.log(`Categories (${categories.size}): ${[...categories].join(", ")}`);
  console.log(`Languages: ${[...languages].join(", ")}`);

  console.log("\nSample Cases:");
  for (const c of selectedCases.slice(0, 5)) {
    console.log(`  [${c.id}] (${c.category}/${c.lang}) "${c.message}" -> expected tool: ${c.expectedTool ?? "none"}`);
  }

  console.log("\n💡 To run live AI model replies through this eval suite:");
  console.log("   1. Option A (Claude): Set ANTHROPIC_API_KEY=... in .env.local");
  console.log("   2. Option B (Ollama): Set AI_PROVIDER=ollama and run `ollama run qwen2.5:7b`");
  console.log("   3. Then run: `npm run reply:eval`\n");

  await closeDb();
  process.exit(0);
}

const model = createChatModel();
const embedder = createEmbedder();

console.log(`Running against AI model: ${process.env.AI_PROVIDER === "ollama" ? "Ollama" : "Anthropic Claude"}`);
console.log(`Evaluating ${selectedCases.length} cases...\n`);

let passedCount = 0;
const failures: Array<{ caseId: string; reason: string; message: string; reply: string }> = [];

for (const [idx, c] of selectedCases.entries()) {
  const [conv] = await db
    .insert(conversations)
    .values({
      businessId: business.id,
      customerId: customer.id,
      channelId: channel.id,
    })
    .returning();

  const startTime = performance.now();
  try {
    const result = await handleCustomerMessage({
      businessId: business.id,
      conversationId: conv.id,
      text: c.message,
      model,
      embedder,
    });
    const elapsedMs = Math.round(performance.now() - startTime);

    const fullReply = result.replies.map((r) => r.content).join("\n---\n");
    const lowerReply = fullReply.toLowerCase();
    const errors: string[] = [];

    // 1. Tool check
    if (c.expectedTool !== undefined) {
      if (c.expectedTool === null) {
        if (result.toolCalls.length > 0) {
          errors.push(`Expected no tools, but called: ${result.toolCalls.map((t) => t.name).join(", ")}`);
        }
      } else {
        const called = result.toolCalls.some((t) => t.name === c.expectedTool);
        if (!called) {
          errors.push(`Expected tool "${c.expectedTool}", but got: ${result.toolCalls.map((t) => t.name).join(", ") || "none"}`);
        }
      }
    }

    // 2. Rhythm: Bubble count check
    const maxBubbles = c.maxBubbles ?? 3;
    if (result.replies.length > maxBubbles) {
      errors.push(`Exceeded max bubbles (${result.replies.length} > ${maxBubbles})`);
    }

    // 3. Formatting check: No markdown bold or headers
    if (fullReply.includes("**")) {
      errors.push(`Contains forbidden markdown bold (**...)`);
    }

    // 4. Robotic / AI phrases
    const roboticPhrases = ["as an ai", "as a language model", "certainly!", "i apologize for the inconvenience"];
    for (const phrase of roboticPhrases) {
      if (lowerReply.includes(phrase)) {
        errors.push(`Contains robotic phrase: "${phrase}"`);
      }
    }

    // 5. Must include
    if (c.mustInclude && c.mustInclude.length > 0) {
      const missing = c.mustInclude.filter((term) => !lowerReply.includes(term.toLowerCase()));
      if (missing.length === c.mustInclude.length && c.mustInclude.length > 1) {
        errors.push(`Missing any of expected facts: [${c.mustInclude.join(", ")}]`);
      } else if (c.mustInclude.length === 1 && missing.length > 0) {
        errors.push(`Missing expected fact: "${c.mustInclude[0]}"`);
      }
    }

    // 6. Must not include
    if (c.mustNotInclude) {
      for (const forbidden of c.mustNotInclude) {
        if (lowerReply.includes(forbidden.toLowerCase())) {
          errors.push(`Contains forbidden phrase: "${forbidden}"`);
        }
      }
    }

    if (errors.length === 0) {
      passedCount++;
      console.log(`[PASS] (${idx + 1}/${selectedCases.length}) ${c.id.padEnd(10)} [${c.category}] "${c.message}" (${elapsedMs}ms, ${result.replies.length} bubble${result.replies.length > 1 ? "s" : ""})`);
    } else {
      console.log(`[FAIL] (${idx + 1}/${selectedCases.length}) ${c.id.padEnd(10)} [${c.category}] "${c.message}" (${elapsedMs}ms)`);
      for (const err of errors) {
        console.log(`       ⚠️  ${err}`);
      }
      failures.push({
        caseId: c.id,
        reason: errors.join("; "),
        message: c.message,
        reply: fullReply,
      });
    }
  } catch (err) {
    const elapsedMs = Math.round(performance.now() - startTime);
    console.log(`[ERR ] (${idx + 1}/${selectedCases.length}) ${c.id.padEnd(10)} [${c.category}] "${c.message}" (${elapsedMs}ms): ${err instanceof Error ? err.message : String(err)}`);
    failures.push({
      caseId: c.id,
      reason: `Exception: ${err instanceof Error ? err.message : String(err)}`,
      message: c.message,
      reply: "",
    });
  }
}

const scorePct = Math.round((passedCount / selectedCases.length) * 100);
console.log(`\n----------------------------------------`);
console.log(`Results: ${passedCount}/${selectedCases.length} Passed (${scorePct}%)`);
console.log(`----------------------------------------`);

if (failures.length > 0) {
  console.log(`\nFailures (${failures.length}):`);
  for (const f of failures) {
    console.log(`- [${f.caseId}] ${f.reason}`);
    console.log(`  Message: "${f.message}"`);
    if (f.reply) console.log(`  Reply:   "${f.reply.replace(/\n/g, " ")}"`);
  }
}

await closeDb();

if (scorePct < 85) {
  console.error(`\nEvaluation score ${scorePct}% is below the 85% regression threshold.`);
  process.exit(1);
} else {
  console.log(`\n✅ Evaluation passed.`);
  process.exit(0);
}
