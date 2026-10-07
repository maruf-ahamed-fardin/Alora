"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight, Lock, Mail, Store, AlertCircle, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in both email and password.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to sign in");
      }

      router.push("/inbox");
      router.refresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickLogin(demoEmail: string, demoPass: string) {
    setEmail(demoEmail);
    setPassword(demoPass);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: demoEmail, password: demoPass }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Quick login failed");
      }

      router.push("/inbox");
      router.refresh();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12 text-foreground selection:bg-emerald-500/20">
      {/* Background Glow */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center overflow-hidden">
        <div className="h-[480px] w-[480px] rounded-full bg-emerald-500/10 blur-[120px] dark:bg-emerald-500/15" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Brand Header */}
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-400/30">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="text-2xl font-bold tracking-tight">Alora</span>
          </Link>
          <h1 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
            Welcome back
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Sign in to access your omnichannel unified inbox & AI assistant
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border/80 bg-card/80 p-6 shadow-xl backdrop-blur-xl sm:p-8">
          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-foreground/80">
                Email Address
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@alora.ai"
                  required
                  className="w-full rounded-xl border border-border bg-background/60 py-2.5 pl-10 pr-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-foreground/80">
                  Password
                </label>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl border border-border bg-background/60 py-2.5 pl-10 pr-3.5 text-sm outline-none transition-all placeholder:text-muted-foreground focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-medium text-white shadow-md shadow-emerald-600/20 transition-all hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-60"
            >
              {loading ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Switcher Section */}
          <div className="mt-6 border-t border-border/80 pt-5">
            <p className="mb-3 text-center text-xs font-medium text-muted-foreground">
              ⚡ Instant 1-Click Multi-Business Switcher
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleQuickLogin("admin@alora.ai", "password123")}
                disabled={loading}
                className="flex items-center gap-2 rounded-xl border border-border/80 bg-accent/40 p-2.5 text-left text-xs transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/10"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <Store className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">Demo Shop</p>
                  <p className="text-[10px] text-muted-foreground truncate">admin@alora.ai</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin("artisan@example.com", "password123")}
                disabled={loading}
                className="flex items-center gap-2 rounded-xl border border-border/80 bg-accent/40 p-2.5 text-left text-xs transition-colors hover:border-amber-500/40 hover:bg-amber-500/10"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <Store className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">Artisan Leather</p>
                  <p className="text-[10px] text-muted-foreground truncate">artisan@example.com</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
          >
            Create a business account
          </Link>
        </p>
      </div>
    </div>
  );
}
