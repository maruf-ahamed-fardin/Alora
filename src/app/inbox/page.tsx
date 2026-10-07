"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bell,
  BellRing,
  Bot,
  CheckCircle2,
  ChevronLeft,
  Clock,
  Download,
  Filter,
  MessageCircle,
  MessageSquare,
  Package,
  Phone,
  Power,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  User,
  UserCheck,
  UserX,
  LogIn,
  LogOut,
  Store,
} from "lucide-react";
import { usePwa } from "../../components/pwa-provider";

type ConversationSummary = {
  id: string;
  status: "open" | "handoff" | "closed";
  aiEnabled: boolean;
  lastMessageAt: string;
  createdAt: string;
  customer: {
    id: string;
    name: string | null;
    phone: string | null;
    externalId: string;
  };
  channel: {
    id: string;
    type: "playground" | "telegram" | "messenger" | "instagram" | "whatsapp" | "x" | "web";
    name: string;
  };
  lastMessage?: {
    id: string;
    sender: "customer" | "ai" | "agent" | "system";
    content: string;
    createdAt: string;
  };
  unread: boolean;
};

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  placedAt: string;
  courier: string | null;
  trackingCode: string | null;
};

type ConversationDetails = {
  id: string;
  status: "open" | "handoff" | "closed";
  aiEnabled: boolean;
  lastMessageAt: string;
  customerId: string;
  customerName: string | null;
  customerPhone: string | null;
  customerNotes: string | null;
  customerExternalId: string;
  channelId: string;
  channelType: ConversationSummary["channel"]["type"];
  channelName: string;
  orders: Order[];
};

type Message = {
  id: string;
  sender: "customer" | "ai" | "agent" | "system";
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

function formatTime(isoString: string) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
}

function ChannelBadge({ type }: { type: ConversationSummary["channel"]["type"] }) {
  switch (type) {
    case "whatsapp":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          WhatsApp
        </span>
      );
    case "telegram":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[11px] font-medium text-sky-600 dark:text-sky-400 border border-sky-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
          Telegram
        </span>
      );
    case "messenger":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 border border-blue-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          Messenger
        </span>
      );
    case "instagram":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/10 px-2 py-0.5 text-[11px] font-medium text-pink-600 dark:text-pink-400 border border-pink-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-pink-500" />
          Instagram
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[11px] font-medium text-purple-600 dark:text-purple-400 border border-purple-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
          Playground
        </span>
      );
  }
}

export default function UnifiedInboxPage() {
  const {
    canInstall,
    promptInstall,
    isInstalled,
    notificationPermission,
    requestNotificationPermission,
    sendLocalTestNotification,
  } = usePwa();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDetails, setActiveDetails] = useState<ConversationDetails | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [agentText, setAgentText] = useState("");
  const [sending, setSending] = useState(false);
  const [showDetailsPane, setShowDetailsPane] = useState(true);
  const [isSimulatorMode, setIsSimulatorMode] = useState(false);
  const [simText, setSimText] = useState("");
  const [currentUser, setCurrentUser] = useState<{ name: string; email: string; role: string } | null>(null);
  const [currentBusiness, setCurrentBusiness] = useState<{ id: string; name: string; slug: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setCurrentUser(data.user);
          setCurrentBusiness(data.business);
        }
      })
      .catch((err) => console.error("Failed to load auth session", err));
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const fetchConversations = useCallback(
    async (keepActive = true) => {
      try {
        const params = new URLSearchParams();
        if (statusFilter !== "all") params.set("status", statusFilter);
        if (channelFilter !== "all") params.set("channel", channelFilter);
        if (searchQuery.trim()) params.set("search", searchQuery.trim());

        const res = await fetch(`/api/inbox/conversations?${params.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.business) setCurrentBusiness(data.business);
        const list: ConversationSummary[] = data.conversations || [];
        setConversations(list);

        if (!keepActive || !activeId) {
          if (list.length > 0 && !activeId) {
            setActiveId(list[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to fetch conversations", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [statusFilter, channelFilter, searchQuery, activeId],
  );

  const fetchActiveConversation = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/inbox/conversations/${convId}`);
      if (!res.ok) return;
      const data = await res.json();
      setActiveDetails(data.conversation);
      setMessages(data.messages || []);
    } catch (err) {
      console.error("Failed to load conversation", err);
    }
  }, []);

  useEffect(() => {
    void fetchConversations(false);
  }, [fetchConversations]);

  useEffect(() => {
    if (activeId) {
      void fetchActiveConversation(activeId);
    } else {
      setActiveDetails(null);
      setMessages([]);
    }
  }, [activeId, fetchActiveConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Periodic polling every 5s for real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      void fetchConversations(true);
      if (activeId) {
        void fetchActiveConversation(activeId);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchConversations, fetchActiveConversation, activeId]);

  async function handleToggleAi(enable: boolean) {
    if (!activeId) return;
    try {
      const res = await fetch(`/api/inbox/conversations/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiEnabled: enable }),
      });
      if (res.ok) {
        await fetchActiveConversation(activeId);
        await fetchConversations(true);
      }
    } catch (err) {
      console.error("Toggle AI failed", err);
    }
  }

  async function handleStatusChange(newStatus: "open" | "handoff" | "closed") {
    if (!activeId) return;
    try {
      const res = await fetch(`/api/inbox/conversations/${activeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        await fetchActiveConversation(activeId);
        await fetchConversations(true);
      }
    } catch (err) {
      console.error("Status change failed", err);
    }
  }

  async function handleSendAgent(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!activeId || !agentText.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch(`/api/inbox/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: agentText.trim(), sender: "agent" }),
      });
      if (res.ok) {
        setAgentText("");
        await fetchActiveConversation(activeId);
        await fetchConversations(true);
      }
    } catch (err) {
      console.error("Send agent message failed", err);
    } finally {
      setSending(false);
    }
  }

  async function handleSimulateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId || !simText.trim() || sending) return;

    setSending(true);
    try {
      const res = await fetch(`/api/inbox/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: simText.trim(), sender: "customer" }),
      });
      if (res.ok) {
        setSimText("");
        await fetchActiveConversation(activeId);
        await fetchConversations(true);
      }
    } catch (err) {
      console.error("Simulate customer message failed", err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-dvh w-full flex-col bg-background text-foreground antialiased selection:bg-primary/20">
      {/* Top Navigation Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/80 bg-background/95 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="font-semibold tracking-tight text-lg">Alora</span>
          </Link>
          <span className="text-muted-foreground">/</span>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Unified Inbox</span>
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
              <Store className="h-3 w-3" />
              <span>{currentBusiness?.name || "Omnichannel"}</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/playground"
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Bot className="h-3.5 w-3.5" />
            <span>AI Playground</span>
          </Link>
          <Link
            href="/playground/knowledge"
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <span>Knowledge</span>
          </Link>
          {canInstall && !isInstalled && (
            <button
              type="button"
              onClick={promptInstall}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-emerald-700 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Install App</span>
            </button>
          )}

          <button
            type="button"
            onClick={async () => {
              if (notificationPermission !== "granted") {
                const granted = await requestNotificationPermission();
                if (granted) {
                  await sendLocalTestNotification(
                    "Notifications Enabled! 🎉",
                    "You will receive alerts when customers message on WhatsApp or Telegram.",
                  );
                }
              } else {
                await sendLocalTestNotification();
              }
            }}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              notificationPermission === "granted"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
            title={
              notificationPermission === "granted"
                ? "Notifications active (click to trigger test alert)"
                : "Enable push notifications"
            }
          >
            {notificationPermission === "granted" ? (
              <BellRing className="h-3.5 w-3.5" />
            ) : (
              <Bell className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {notificationPermission === "granted" ? "Alerts On" : "Enable Alerts"}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              void fetchConversations(true);
              if (activeId) void fetchActiveConversation(activeId);
            }}
            className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>

          {currentUser ? (
            <div className="flex items-center gap-2 border-l border-border/80 pl-2">
              <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-border/80 bg-accent/40 px-2.5 py-1 text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="font-medium text-foreground">{currentUser.name}</span>
                <span className="text-[10px] text-muted-foreground capitalize">({currentUser.role})</span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                title="Log out"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Log out</span>
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-emerald-500 transition-colors"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </header>

      {/* Main 3-Pane Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Pane 1: Conversations List */}
        <section
          className={`${
            activeId ? "hidden md:flex" : "flex"
          } w-full md:w-80 lg:w-96 shrink-0 flex-col border-r border-border/80 bg-card/50`}
        >
          {/* Search & Filters */}
          <div className="space-y-2 border-b border-border/80 p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customers or messages..."
                className="w-full rounded-xl border border-border bg-background py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-xs scrollbar-none">
              {(["all", "open", "handoff", "closed"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(s)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all ${
                    statusFilter === s
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {s === "all" ? "All" : s === "handoff" ? "Human Needed" : s === "open" ? "Open" : "Closed"}
                </button>
              ))}
            </div>

            {/* Channel filter tabs */}
            <div className="flex items-center gap-1 overflow-x-auto text-[11px] text-muted-foreground scrollbar-none">
              <span className="flex items-center gap-1 font-medium text-[10px] uppercase tracking-wider text-muted-foreground/70">
                <Filter className="h-3 w-3" />
              </span>
              {(["all", "whatsapp", "telegram", "messenger", "instagram", "playground"] as const).map(
                (ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => setChannelFilter(ch)}
                    className={`rounded-md px-1.5 py-0.5 transition-colors ${
                      channelFilter === ch
                        ? "bg-accent font-semibold text-accent-foreground"
                        : "hover:text-foreground"
                    }`}
                  >
                    {ch === "all" ? "Any channel" : ch}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Conversation List Scroll Area */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/40">
            {loading ? (
              <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Loading conversations...
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center px-4 text-center text-xs text-muted-foreground">
                <MessageSquare className="mb-2 h-8 w-8 stroke-1 text-muted-foreground/40" />
                <p className="font-medium text-foreground">No conversations found</p>
                <p className="mt-1">Try changing filters or search keywords.</p>
              </div>
            ) : (
              conversations.map((c) => {
                const isSelected = c.id === activeId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className={`w-full text-left p-3.5 transition-all flex items-start gap-3 relative ${
                      isSelected
                        ? "bg-accent/80 dark:bg-accent/50"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    {/* Left Accent indicator for selected */}
                    {isSelected && (
                      <span className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r" />
                    )}

                    {/* Avatar */}
                    <div className="relative shrink-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                        {(c.customer.name || c.customer.externalId).charAt(0).toUpperCase()}
                      </div>
                      <span className="absolute -bottom-1 -right-1">
                        <ChannelBadge type={c.channel.type} />
                      </span>
                    </div>

                    {/* Metadata */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-medium text-xs truncate">
                          {c.customer.name || c.customer.externalId}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {formatTime(c.lastMessageAt)}
                        </span>
                      </div>

                      <p
                        className={`text-xs truncate ${
                          c.unread
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground"
                        }`}
                      >
                        {c.lastMessage ? c.lastMessage.content : "(No messages)"}
                      </p>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        {c.status === "handoff" ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <UserCheck className="h-3 w-3" />
                            Agent Takeover
                          </span>
                        ) : c.aiEnabled ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            AI Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            AI Paused
                          </span>
                        )}

                        {c.status === "closed" && (
                          <span className="text-[10px] text-muted-foreground">Closed</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        {/* Pane 2: Active Chat Thread */}
        <section
          className={`${
            activeId ? "flex" : "hidden md:flex"
          } flex-1 flex-col overflow-hidden bg-background`}
        >
          {activeDetails ? (
            <>
              {/* Chat Thread Header */}
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/80 px-4">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => setActiveId(null)}
                    className="md:hidden rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-sm truncate">
                        {activeDetails.customerName || activeDetails.customerExternalId}
                      </h2>
                      <ChannelBadge type={activeDetails.channelType} />
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {activeDetails.customerPhone || activeDetails.customerExternalId}
                    </p>
                  </div>
                </div>

                {/* AI / Agent Controls in Header */}
                <div className="flex items-center gap-2">
                  {/* Takeover toggle */}
                  {activeDetails.aiEnabled ? (
                    <button
                      type="button"
                      onClick={() => void handleToggleAi(false)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-all shadow-xs"
                      title="Pause AI and take over this conversation manually"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>Take Over</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleToggleAi(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-all shadow-xs"
                      title="Resume AI automated replies"
                    >
                      <Power className="h-3.5 w-3.5" />
                      <span>Resume AI</span>
                    </button>
                  )}

                  {/* Status Dropdown */}
                  <select
                    value={activeDetails.status}
                    onChange={(e) =>
                      void handleStatusChange(e.target.value as "open" | "handoff" | "closed")
                    }
                    className="rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs font-medium outline-none cursor-pointer"
                  >
                    <option value="open">Open</option>
                    <option value="handoff">Handoff (Agent)</option>
                    <option value="closed">Closed</option>
                  </select>

                  {/* Toggle Inspector Pane */}
                  <button
                    type="button"
                    onClick={() => setShowDetailsPane(!showDetailsPane)}
                    className={`hidden lg:flex rounded-xl border border-border p-1.5 text-muted-foreground transition-colors ${
                      showDetailsPane ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                    }`}
                    title="Toggle customer details panel"
                  >
                    <User className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Status Banner */}
              {activeDetails.status === "handoff" && (
                <div className="flex items-center justify-between border-b border-amber-500/20 bg-amber-500/5 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 shrink-0" />
                    <span>
                      Customer requested human assistance. AI is currently paused.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleToggleAi(true)}
                    className="font-medium underline hover:opacity-80"
                  >
                    Hand back to AI
                  </button>
                </div>
              )}

              {/* Message Thread Scroll View */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
                {messages.length === 0 ? (
                  <div className="flex h-48 flex-col items-center justify-center text-center text-xs text-muted-foreground">
                    <MessageCircle className="mb-2 h-8 w-8 stroke-1 text-muted-foreground/30" />
                    <p>No messages in this conversation yet.</p>
                  </div>
                ) : (
                  messages.map((m) => {
                    const isCustomer = m.sender === "customer";
                    const isSystem = m.sender === "system";
                    const isAi = m.sender === "ai";
                    const isAgent = m.sender === "agent";

                    if (isSystem) {
                      return (
                        <div key={m.id} className="flex justify-center my-2">
                          <span className="rounded-full bg-muted/80 px-3 py-1 text-[11px] font-medium text-muted-foreground border border-border/50">
                            {m.content}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${
                          isAgent ? "items-end" : "items-start"
                        }`}
                      >
                        {/* Sender Label */}
                        <div className="mb-1 flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
                          {isCustomer && (
                            <span className="font-semibold text-foreground/80">
                              {activeDetails.customerName || "Customer"}
                            </span>
                          )}
                          {isAi && (
                            <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                              <Bot className="h-3 w-3" /> Alora AI
                            </span>
                          )}
                          {isAgent && (
                            <span className="flex items-center gap-1 font-semibold text-primary">
                              <User className="h-3 w-3" /> You (Agent)
                            </span>
                          )}
                          <span>· {formatTime(m.createdAt)}</span>
                        </div>

                        {/* Bubble */}
                        <div
                          className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap shadow-2xs ${
                            isAgent
                              ? "rounded-br-xs bg-primary text-primary-foreground font-normal"
                              : isAi
                              ? "rounded-bl-xs bg-emerald-500/10 text-foreground border border-emerald-500/20"
                              : "rounded-bl-xs bg-muted text-foreground border border-border/40"
                          }`}
                        >
                          {m.content}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer Footer */}
              <div className="border-t border-border/80 p-3 bg-card/40">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-[11px]">
                      {isSimulatorMode ? "Customer Simulation Mode" : "Agent Response Mode"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsSimulatorMode(!isSimulatorMode)}
                      className="text-[11px] text-primary hover:underline"
                    >
                      {isSimulatorMode ? "Switch to Agent" : "Test as Customer"}
                    </button>
                  </div>
                  {activeDetails.aiEnabled && !isSimulatorMode && (
                    <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      AI enabled
                    </span>
                  )}
                </div>

                {isSimulatorMode ? (
                  // Simulator form
                  <form onSubmit={handleSimulateCustomer} className="flex gap-2 items-end">
                    <textarea
                      rows={1}
                      value={simText}
                      onChange={(e) => setSimText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSimulateCustomer(e);
                        }
                      }}
                      placeholder="Type a message as the customer (to test AI reply or agent flow)..."
                      className="flex-1 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm outline-none focus:border-amber-500 transition-all resize-none max-h-32"
                    />
                    <button
                      type="submit"
                      disabled={sending || !simText.trim()}
                      className="h-10 rounded-xl bg-amber-600 px-4 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-40 transition-colors shrink-0"
                    >
                      Simulate
                    </button>
                  </form>
                ) : (
                  // Agent reply form
                  <form onSubmit={handleSendAgent} className="flex gap-2 items-end">
                    <textarea
                      rows={1}
                      value={agentText}
                      onChange={(e) => setAgentText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendAgent();
                        }
                      }}
                      placeholder="Write a message to the customer as human agent..."
                      className="flex-1 rounded-xl border border-border bg-background px-3.5 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none max-h-32"
                    />
                    <button
                      type="submit"
                      disabled={sending || !agentText.trim()}
                      className="h-10 rounded-xl bg-primary px-4 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0 flex items-center gap-1.5"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Send</span>
                    </button>
                  </form>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center p-8 text-center text-muted-foreground">
              <MessageSquare className="mb-3 h-12 w-12 stroke-1 text-muted-foreground/30" />
              <h3 className="text-base font-semibold text-foreground">Select a Conversation</h3>
              <p className="mt-1 text-xs max-w-sm">
                Pick a customer from the left list to inspect chat history, see order details, or take over with manual replies.
              </p>
            </div>
          )}
        </section>

        {/* Pane 3: Customer & Orders Inspector */}
        {activeDetails && showDetailsPane && (
          <aside className="hidden lg:flex w-72 lg:w-80 shrink-0 flex-col border-l border-border/80 bg-card/30 p-4 overflow-y-auto space-y-5">
            {/* Customer Profile Box */}
            <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-2xs">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary font-bold text-base">
                  {(activeDetails.customerName || activeDetails.customerExternalId).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm truncate">
                    {activeDetails.customerName || "Customer"}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate">
                    ID: {activeDetails.customerExternalId}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-xs border-t border-border/60 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" /> Phone
                  </span>
                  <span className="font-medium text-foreground">
                    {activeDetails.customerPhone || "Not provided"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Channel</span>
                  <ChannelBadge type={activeDetails.channelType} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className="capitalize font-medium text-foreground">
                    {activeDetails.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Orders Section */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5" /> Recent Orders ({activeDetails.orders.length})
              </h4>

              {activeDetails.orders.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  No previous orders found for this customer.
                </div>
              ) : (
                activeDetails.orders.map((o) => (
                  <div
                    key={o.id}
                    className="rounded-xl border border-border/80 bg-card p-3 text-xs space-y-1.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground">{o.orderNumber}</span>
                      <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary capitalize">
                        {o.status}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                      <span>Total: ৳{o.total}</span>
                      <span>{new Date(o.placedAt).toLocaleDateString()}</span>
                    </div>
                    {o.courier && (
                      <div className="text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                        Courier: {o.courier}
                        {o.trackingCode && ` (Track: ${o.trackingCode})`}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Quick Actions */}
            <div className="space-y-2 pt-2 border-t border-border/60">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quick Actions
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleStatusChange("closed")}
                  className="rounded-xl border border-border py-2 text-xs font-medium hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  Close Chat
                </button>
                <button
                  type="button"
                  onClick={() => void handleToggleAi(!activeDetails.aiEnabled)}
                  className="rounded-xl border border-border py-2 text-xs font-medium hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                >
                  {activeDetails.aiEnabled ? "Pause AI" : "Enable AI"}
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
