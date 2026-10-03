"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Doc = { id: string; kind: string; title: string; content: string; chunkCount: number };
type Example = { id: string; customerMessage: string; reply: string; indexed: boolean };

const KINDS = ["about", "faq", "policy", "delivery", "payment", "other"];

const field =
  "w-full rounded-xl border border-black/15 bg-transparent px-3 py-2 text-base outline-none focus:border-emerald-600 dark:border-white/20";
const smallButton =
  "rounded-lg border border-black/15 px-2.5 py-1 text-sm disabled:opacity-40 dark:border-white/20";

export default function KnowledgePage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [examples, setExamples] = useState<Example[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [kind, setKind] = useState("faq");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  const [customerMessage, setCustomerMessage] = useState("");
  const [reply, setReply] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/knowledge", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return setError(data.error.message);
    setDocs(data.documents);
    setExamples(data.examples);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load from the API
    void load();
  }, [load]);

  // One place for every write: shows progress, surfaces the API's message.
  async function call(url: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "content-type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error.message);
        return false;
      }
      await load();
      return true;
    } catch {
      setError("Could not reach the server.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function resetDocForm() {
    setEditingId(null);
    setKind("faq");
    setTitle("");
    setContent("");
  }

  async function saveDoc(e: React.FormEvent) {
    e.preventDefault();
    const ok = editingId
      ? await call("/api/knowledge", {
          method: "PUT",
          body: JSON.stringify({ id: editingId, kind, title, content }),
        })
      : await call("/api/knowledge", {
          method: "POST",
          body: JSON.stringify({ type: "document", kind, title, content }),
        });
    if (ok) resetDocForm();
  }

  async function addExample(e: React.FormEvent) {
    e.preventDefault();
    const ok = await call("/api/knowledge", {
      method: "POST",
      body: JSON.stringify({ type: "example", customerMessage, reply }),
    });
    if (ok) {
      setCustomerMessage("");
      setReply("");
    }
  }

  const remove = (type: "document" | "example", id: string) =>
    call(`/api/knowledge?type=${type}&id=${id}`, { method: "DELETE" });

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold">Knowledge</h1>
          <p className="text-xs opacity-60">
            What the AI knows about the shop, and how the team talks.
          </p>
        </div>
        <Link href="/playground" className={smallButton}>
          ← Test chat
        </Link>
      </header>

      {busy && (
        <p className="rounded-lg bg-black/[0.06] px-3 py-2 text-sm dark:bg-white/[0.12]">
          Saving and indexing… the first save loads the search model and can take about 30 seconds.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm">
          {error}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-70">Shop information</h2>
        <form onSubmit={saveDoc} className="space-y-2 rounded-2xl border border-black/10 p-3 dark:border-white/15">
          <div className="flex gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={`${field} w-36 shrink-0`}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Delivery)" className={field} />
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder="Write it the way you would explain it to a new team member. Bangla, Banglish or English."
            className={field}
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || !title.trim() || !content.trim()}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {editingId ? "Update" : "Add"}
            </button>
            {editingId && (
              <button type="button" onClick={resetDocForm} className={smallButton}>
                Cancel
              </button>
            )}
          </div>
        </form>

        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id} className="rounded-2xl border border-black/10 p-3 dark:border-white/15">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {d.title}{" "}
                    <span className="ml-1 rounded-full bg-black/[0.06] px-2 py-0.5 text-[11px] font-normal dark:bg-white/[0.12]">
                      {d.kind}
                    </span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-sm opacity-80">{d.content}</p>
                  <p className="mt-1 text-[11px] opacity-40">
                    {d.chunkCount} searchable {d.chunkCount === 1 ? "piece" : "pieces"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    className={smallButton}
                    onClick={() => {
                      setEditingId(d.id);
                      setKind(d.kind);
                      setTitle(d.title);
                      setContent(d.content);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Edit
                  </button>
                  <button type="button" disabled={busy} className={smallButton} onClick={() => remove("document", d.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
          {docs.length === 0 && <li className="text-sm opacity-60">Nothing yet.</li>}
        </ul>
      </section>

      <section className="space-y-3 pb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide opacity-70">Past replies (the shop&apos;s voice)</h2>
        <p className="text-xs opacity-60">
          Real replies your team sent. The AI sees the most similar ones for each message and copies the tone, not the facts.
        </p>
        <form onSubmit={addExample} className="space-y-2 rounded-2xl border border-black/10 p-3 dark:border-white/15">
          <input value={customerMessage} onChange={(e) => setCustomerMessage(e.target.value)} placeholder="Customer wrote…" className={field} />
          <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} placeholder="Your team replied…" className={field} />
          <button
            type="submit"
            disabled={busy || !customerMessage.trim() || !reply.trim()}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            Add
          </button>
        </form>
        <ul className="space-y-2">
          {examples.map((x) => (
            <li key={x.id} className="flex items-start justify-between gap-2 rounded-2xl border border-black/10 p-3 text-sm dark:border-white/15">
              <div className="min-w-0 space-y-0.5">
                <p className="opacity-70">Customer: {x.customerMessage}</p>
                <p>Team: {x.reply}</p>
                {!x.indexed && <p className="text-[11px] text-amber-600">not searchable yet</p>}
              </div>
              <button type="button" disabled={busy} className={smallButton} onClick={() => remove("example", x.id)}>
                Delete
              </button>
            </li>
          ))}
          {examples.length === 0 && <li className="text-sm opacity-60">Nothing yet.</li>}
        </ul>
      </section>
    </div>
  );
}
