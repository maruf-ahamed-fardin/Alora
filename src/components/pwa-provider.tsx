"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Download, Bell, X, CheckCircle } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type PwaContextType = {
  isInstalled: boolean;
  canInstall: boolean;
  promptInstall: () => Promise<void>;
  notificationPermission: NotificationPermission;
  requestNotificationPermission: () => Promise<boolean>;
  sendLocalTestNotification: (title?: string, body?: string) => Promise<void>;
};

const PwaContext = createContext<PwaContextType>({
  isInstalled: false,
  canInstall: false,
  promptInstall: async () => {},
  notificationPermission: "default",
  requestNotificationPermission: async () => false,
  sendLocalTestNotification: async () => {},
});

export const usePwa = () => useContext(PwaContext);

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [showBanner, setShowBanner] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    // Check if running in standalone PWA mode
    if (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    ) {
      setIsInstalled(true);
    }

    // Register Service Worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          // Check for service worker updates periodically
          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                  console.log("Alora PWA updated. Reload for latest version.");
                }
              };
            }
          };
        })
        .catch((err) => {
          console.warn("Service worker registration error:", err);
        });
    }

    // Track Notification Permission
    if ("Notification" in window) {
      setNotificationPermission(Notification.permission);
    }

    // Capture install prompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setCanInstall(true);
      setShowBanner(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setCanInstall(false);
      setShowBanner(false);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
        setCanInstall(false);
        setShowBanner(false);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.warn("Install prompt error:", err);
    }
  };

  const requestNotificationPermission = async (): Promise<boolean> => {
    if (!("Notification" in window)) return false;
    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      return permission === "granted";
    } catch {
      return false;
    }
  };

  const sendLocalTestNotification = async (
    title = "Alora — New Customer Message",
    body = "Nusrat Jahan sent: 'Delivery charge koto lagbe Dhaka te?'",
  ) => {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: "/icons/icon-192.svg",
          badge: "/icons/icon-192.svg",
          vibrate: [100, 50, 100],
          data: { url: "/inbox" },
          tag: "alora-test-notif",
        } as unknown as NotificationOptions);
        return;
      }
    }

    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, {
        body,
        icon: "/icons/icon-192.svg",
      });
    }
  };

  return (
    <PwaContext.Provider
      value={{
        isInstalled,
        canInstall,
        promptInstall,
        notificationPermission,
        requestNotificationPermission,
        sendLocalTestNotification,
      }}
    >
      {children}

      {/* Floating Install Banner (Prompt when installable and not yet dismissed) */}
      {canInstall && showBanner && !bannerDismissed && !isInstalled && (
        <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-md rounded-2xl border border-emerald-500/30 bg-card/95 p-3.5 shadow-xl backdrop-blur-md dark:border-emerald-500/20">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
              <Download className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground">
                Install Alora App
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Add Alora to your home screen for quick access and real-time customer notifications.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={promptInstall}
                  className="rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-xs hover:bg-emerald-700 transition-colors"
                >
                  Install Now
                </button>
                <button
                  type="button"
                  onClick={() => setBannerDismissed(true)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  Later
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="text-muted-foreground hover:text-foreground p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </PwaContext.Provider>
  );
}
