"use client";

import clsx from "clsx";
import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { t } from "@/lib/i18n";

export interface OfflineBannerProps {
  /** Server/DB reachability (e.g. from a query error state). */
  supabaseReachable?: boolean;
  className?: string;
}

/**
 * OfflineBanner — full-width warning banner shown when `navigator.onLine` is
 * false or Supabase is unreachable: "אין חיבור — מוצג נתון שמור" (doc 05 §7).
 * Not dismissible while offline.
 */
export function OfflineBanner({ supabaseReachable = true, className }: OfflineBannerProps) {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const visible = !online || !supabaseReachable;
  if (!visible) return null;

  return (
    <div
      role="status"
      className={clsx(
        "flex w-full items-center justify-center gap-2 bg-warning/12 px-4 py-2 text-sm font-medium text-warning",
        className,
      )}
    >
      <WifiOff aria-hidden size={16} className="shrink-0" />
      <span>{online ? t("common.offlineBannerSync") : t("common.offlineBanner")}</span>
    </div>
  );
}
