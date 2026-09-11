"use client";

import { useEffect, useState } from "react";
import { BedDouble } from "lucide-react";
import { t } from "@/lib/i18n";
import type { StayData } from "@/lib/data/stay";
import { BookingMissionBanner } from "./BookingMissionBanner";
import { RequirementsCard } from "./RequirementsCard";
import { CandidatesCard } from "./CandidatesCard";
import { BookedCard } from "./BookedCard";

export interface StayViewProps {
  data: StayData | null;
}

/** Whole-screen client view with offline snapshot fallback (key: "stay"). */
export function StayView({ data }: StayViewProps) {
  const [fallback, setFallback] = useState<StayData | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (data) {
      void import("@/lib/offline/db").then(({ cacheSnapshot }) => cacheSnapshot("stay", data));
      if (!cancelled) {
        setFromCache(false);
        setSyncedAt(Date.now());
      }
    } else {
      void import("@/lib/offline/db").then(({ readSnapshot }) =>
        readSnapshot<StayData>("stay").then((snap) => {
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
        <BedDouble aria-hidden size={48} className="text-text-muted" />
        <p className="text-sm text-text-secondary">{t("common.empty")}</p>
      </div>
    );
  }

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

      {effective.booked ? (
        <BookedCard
          booked={effective.booked}
          arrivalChecklist={effective.arrivalChecklist}
          departureChecklist={effective.departureChecklist}
        />
      ) : (
        <>
          <BookingMissionBanner />
          <RequirementsCard />
          <CandidatesCard
            candidates={effective.candidates}
            memberCount={effective.memberCount}
            fx={effective.fx}
            isBooked={false}
          />
        </>
      )}
    </div>
  );
}
