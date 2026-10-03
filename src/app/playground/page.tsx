"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type Bubble = {
  id: string;
  sender: "customer" | "ai" | "agent" | "system";
  content: string;
  info?: string;
};

type Usage = { inputTokens: number; outputTokens: number; cacheReadTokens: number };

type ToolCall = { name: string; input: unknown; isError: boolean };

type StoredMessage = Bubble & {
  metadata?: { model?: string; usage?: Usage; sources?: string[]; toolCalls?: ToolCall[] };
};

type ApiError = { code: string; message: string };

const SAMPLES = [
  "vai black tshirt ache?",
  "white tshirt L size ache?",
  "navy hoodie ache?",
  "দাম কত?",
  "price koto?",
  "ভাই delivery charge কত?",
  "sylhet e delivery charge koto?",
  "ORD-1001 kothay?",
  "order ta ekhono ashe nai 😡",
  "tumi ki bot?",
  "I want to talk to a manager",
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A person needs a moment to type; longer text takes longer.
const typingDelay = (text: string) => Math.min(2200, 500 + text.length * 25);

// "get_product(black tshirt)", with a ! if the tool reported an error.
function toolLabel(call: ToolCall) {
  const input =
    call.input && typeof call.input === "object" ? Object.values(call.input).join(", ") : "";
  return `${call.name}(${input})${call.isError ? "!" : ""}`;
}

function infoLine(meta?: StoredMessage["metadata"]) {
  if (!meta?.model || !meta.usage) return undefined;
  const { inputTokens, outputTokens, cacheReadTokens } = meta.usage;
  const sources = meta.sources?.length ? ` · looked at: ${meta.sources.join(", ")}` : "";
  const tools = meta.toolCalls?.length ? ` · tools: ${meta.toolCalls.map(toolLabel).join(", ")}` : "";
  return `${meta.model} · in ${inputTokens} (cached ${cacheReadTokens}) · out ${outputTokens}${sources}${tools}`;
}

export default function PlaygroundPage() {
  const [businessName, setBusinessName] = useState("");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [aiConfigured, setAiConfigured] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/playground", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setBusinessName(data.business.name);
    setAiConfigured(data.aiConfigured);
    setBubbles(
      (data.messages as StoredMessage[]).map((m) => ({
        id: m.id,
        sender: m.sender,
        content: m.content,
        info: infoLine(m.metadata),
      })),
    );
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from the API
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [bubbles, typing]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || busy) return;

    setBusy(true);
    setError(null);
    setDraft("");
    setBubbles((prev) => [
      ...prev,
      { id: `local-${Date.now()}`, sender: "customer", content: message },
    ]);
    setTyping(true);

    try {
      const res = await fetch("/api/playground", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }

      const info = infoLine({
        model: data.model,
        usage: data.usage as Usage,
        sources: (data.retrieved?.knowledge ?? []).map((k: { title: string }) => k.title),
        toolCalls: data.toolCalls as ToolCall[],
      });

      for (const [i, reply] of (data.replies as { id: string; content: string }[]).entries()) {
        if (i > 0) {
          setTyping(true);
          await sleep(typingDelay(reply.content));
        }
        setTyping(false);
        setBubbles((prev) => [
          ...prev,
          { id: reply.id, sender: "ai", content: reply.content, info: i === 0 ? info : undefined },
        ]);
      }
    } catch {
      setError({ code: "network", message: "Could not reach the server." });
    } finally {
      setTyping(false);
      setBusy(false);
    }
  }

  async function reset() {
    if (busy) return;
    await fetch("/api/playground", { method: "DELETE" });
    setError(null);
    await load();
  }

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-black/10 px-4 py-3 dark:border-white/15">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">
            {businessName || "Alora"} · test chat
          </h1>
          <p className="text-xs opacity-60">
            Local playground. Nothing here is sent to a real customer.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/playground/knowledge"
            className="rounded-lg border border-black/15 px-3 py-1.5 text-sm dark:border-white/20"
          >
            Knowledge
          </Link>
          <button
            type="button"
            onClick={reset}
            disabled={busy}
            className="rounded-lg border border-black/15 px-3 py-1.5 text-sm disabled:opacity-40 dark:border-white/20"
          >
            Start over
          </button>
        </div>
      </header>

      {!aiConfigured && (
        <p className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm">
          AI is not configured yet. Add <code>ANTHROPIC_API_KEY</code> to{" "}
          <code>.env.local</code> and restart <code>npm run dev</code>.
        </p>
      )}

      <main className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {bubbles.length === 0 && !error && (
          <p className="pt-8 text-center text-sm opacity-60">
            Write like a customer would. Try one of the examples below.
          </p>
        )}
        {bubbles.map((b) => (
          <div
            key={b.id}
            className={`flex flex-col ${b.sender === "customer" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[15px] leading-relaxed ${
                b.sender === "customer"
                  ? "rounded-br-md bg-emerald-600 text-white"
                  : "rounded-bl-md bg-black/[0.06] dark:bg-white/[0.12]"
              }`}
            >
              {b.content}
            </div>
            {b.info && <span className="mt-0.5 px-1 text-[11px] opacity-40">{b.info}</span>}
          </div>
        ))}
        {typing && (
          <div className="flex items-start">
            <div className="rounded-2xl rounded-bl-md bg-black/[0.06] px-3.5 py-2.5 text-sm opacity-70 dark:bg-white/[0.12]">
              typing…
            </div>
          </div>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm"
          >
            {error.message}
          </p>
        )}
        <div ref={bottomRef} />
      </main>

      <footer className="space-y-2 border-t border-black/10 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 dark:border-white/15">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {SAMPLES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              onClick={() => send(s)}
              className="shrink-0 rounded-full border border-black/15 px-3 py-1 text-sm disabled:opacity-40 dark:border-white/20"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
            rows={1}
            placeholder="Message লিখুন…"
            // 16px stops iOS from zooming the page when the field is focused.
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-black/15 bg-transparent px-3.5 py-2.5 text-base outline-none focus:border-emerald-600 dark:border-white/20"
          />
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="h-11 shrink-0 rounded-2xl bg-emerald-600 px-4 text-sm font-medium text-white disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  );
}
