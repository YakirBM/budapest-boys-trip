"use client";

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { t } from "@/lib/i18n";
import type { SafetyData } from "@/lib/data/safety";
import { EmergencyNowCard } from "./EmergencyNowCard";
import { InsuranceCard } from "./InsuranceCard";
import { MedicalProfileCard } from "./MedicalProfileCard";
import { GroupSafetyCard } from "./GroupSafetyCard";

export interface SafetyViewProps {
  data: SafetyData | null;
  tripId: string;
  emergencyPhone: string;
}

/**
 * Whole-screen client view for the four safety cards, with offline snapshot
 * fallback (key: "safety"). tel:/copy/phrase blocks always work offline.
 */
export function SafetyView({ data, tripId, emergencyPhone }: SafetyViewProps) {
  const [fallback, setFallback] = useState<SafetyData | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (data) {
      void import("@/lib/offline/db").then(({ cacheSnapshot }) => cacheSnapshot("safety", data));
      if (!cancelled) {
        setFromCache(false);
        setSyncedAt(Date.now());
      }
    } else {
      void import("@/lib/offline/db").then(({ readSnapshot }) =>
        readSnapshot<SafetyData>("safety").then((snap) => {
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
        <ShieldAlert aria-hidden size={48} className="text-text-muted" />
        <p className="text-sm text-text-secondary">{t("common.empty")}</p>
        <a
          href="tel:112"
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-danger px-6 text-lg font-bold text-white"
        >
          {t("safety.call112")}
        </a>
      </div>
    );
  }

  const airlineContact = effective.contacts.find((contact) => contact.kind === "airline");

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

      <EmergencyNowCard
        bookedAddress={effective.bookedAddress}
        emergencyPhone={emergencyPhone}
        tripId={tripId}
        viewerId={effective.viewerId}
      />

      <InsuranceCard insurance={effective.insurance} />

      <MedicalProfileCard profile={effective.medicalProfile} accessLog={effective.accessLog} />

      <GroupSafetyCard
        soloNotices={effective.soloNotices}
        nightMeeting={effective.nightMeeting}
        viewerName={effective.viewerName}
        memberPhones={effective.memberPhones}
      />

      {airlineContact && (
        <p className="text-center text-xs text-text-muted">
          {airlineContact.label} ·{" "}
          <span dir="ltr" className="ltr-iso tnum">
            {airlineContact.phone}
          </span>
        </p>
      )}
    </div>
  );
}
