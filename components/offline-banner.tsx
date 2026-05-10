"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { messageFor } from "@/lib/errors/user-messages";
import { ERROR_CODES } from "@/lib/errors/error-codes";

/**
 * Subtle banner pinned to the top whenever the browser reports offline.
 * We rely on `navigator.onLine` plus the `online` / `offline` events.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOffline(!navigator.onLine);
    const onOnline = () => setOffline(false);
    const onOffline = () => setOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (!offline) return null;
  const m = messageFor(ERROR_CODES.NET_OFFLINE);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-warning px-4 py-1.5 text-xs font-medium text-warning-foreground shadow-sm"
    >
      <WifiOff className="h-3.5 w-3.5" />
      <span>{m.title}.</span>
      <span className="hidden text-warning-foreground/80 sm:inline">
        {m.description}
      </span>
    </div>
  );
}
