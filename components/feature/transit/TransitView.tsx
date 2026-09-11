"use client";

import { useEffect, useState } from "react";
import { TrainFront } from "lucide-react";
import { t } from "@/lib/i18n";
import type { TransitData } from "@/lib/data/transit";
import { NextDestinationCard } from "./NextDestinationCard";
import { Warning100ECard } from "./Warning100ECard";
import { TicketsCard } from "./TicketsCard";
import { ValidationCard } from "./ValidationCard";
import { AnchorsGrid, ModesCards, TaxiRulesCard } from "./AnchorModesCards";

export interface TransitViewProps {
  data: TransitData | null;
}

/** Whole-screen client view with offline snapshot fallback (key: "transit"). */
export function TransitView({ data }: TransitViewProps) {
  const [fallback, setFallback] = useState<TransitData | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (data) {
      void import("@/lib/offline/db").then(({ cacheSnapshot }) => cacheSnapshot("transit", data));
      if (!cancelled) {
        setFromCache(false);
        setSyncedAt(Date.now());
      }
    } else {
      void import("@/lib/offline/db").then(({ readSnapshot }) =>
        readSnapshot<TransitData>("transit").then((snap) => {
          if (cancelled || !snap) return;
          setFallback(snap.data);
          setFromCache(true);
          setSyncedAt(snap.synced_at);
        }),
      );
    }
    return () => {
      cancelled = true;
    };
  }, [data]);

  const effective = data ?? fallback;

  if (!effective) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <TrainFront aria-hidden size={48} className="text-text-muted" />
        <p className="text-sm text-text-secondary">{t("common.empty")}</p>
      </div>
    );
  }

  const ticket100e = effective.tickets.find((ticket) => ticket.code === "100e") ?? null;

  return (
    <div className="flex flex-col gap-4 pb-4">
      {fromCache && (
        <p className="text-xs text-text-muted" role="status">
          {t("common.offlineBanner")} ·{" "}
          {syncedAt !== null &&
            new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(
              new Date(syncedAt),
            )}
        </p>
      )}

      <NextDestinationCard nextItem={effective.nextItem} />

      <Warning100ECard ticket={ticket100e} />

      <TicketsCard tickets={effective.tickets} />

      <ValidationCard />

      <AnchorsGrid anchors={effective.anchors} />

      <ModesCards anchors={effective.anchors} />

      <TaxiRulesCard />
    </div>
  );
}
