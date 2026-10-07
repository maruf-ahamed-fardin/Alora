import Link from "next/link";
import { Sparkles, MessageSquare, Bot, LogIn, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-16 text-center selection:bg-emerald-500/20">
      {/* Background radial gradient */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        <div className="h-[500px] w-[500px] rounded-full bg-emerald-500/10 blur-[130px] dark:bg-emerald-500/15" />
      </div>

      <div className="relative z-10 max-w-2xl space-y-5">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Omnichannel AI Assistant Platform</span>
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl text-foreground">
          Alora
        </h1>

        <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto">
          Intelligent customer conversations across WhatsApp, Telegram, Messenger, and Instagram. Built for high conversion with real-time human takeover.
        </p>

        {/* Primary CTA Buttons */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/inbox"
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-500 transition-all active:scale-[0.99]"
          >
            <MessageSquare className="h-4 w-4" />
            <span>Open Unified Inbox</span>
          </Link>

          <Link
            href="/playground"
            className="flex items-center gap-2 rounded-xl border border-border bg-card/60 px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-accent transition-colors"
          >
            <Bot className="h-4 w-4" />
            <span>AI Playground</span>
          </Link>
        </div>

        {/* Auth CTA Banner */}
        <div className="pt-6 border-t border-border/80 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-emerald-500 transition-colors"
          >
            <LogIn className="h-3.5 w-3.5" />
            <span>Sign In to Your Business</span>
          </Link>
          <span>•</span>
          <Link
            href="/signup"
            className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
          >
            <span>Register New Business</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </main>
  );
}
