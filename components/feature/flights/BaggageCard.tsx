"use client";

import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";

const RULES: { key: Parameters<typeof t>[0]; paid: boolean }[] = [
  { key: "flights.baggagePersonal", paid: false },
  { key: "flights.baggageCarryOn", paid: false },
  { key: "flights.baggageTrolley", paid: true },
  { key: "flights.baggageChecked", paid: true },
];

/** Static baggage rules from the Arkia e-ticket terms (doc 02 table, Hebrew via i18n). */
export function BaggageCard() {
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-text-primary">{t("flights.baggageTitle")}</h2>
      <ul className="flex flex-col gap-2">
        {RULES.map((rule) => (
          <li key={rule.key} className="flex items-start gap-2 rounded-xl border border-border px-3 py-2">
            <span
              aria-hidden
              className={`mt-0.5 inline-flex min-h-6 shrink-0 items-center rounded-full px-2 text-[11px] font-bold ${
                rule.paid ? "bg-warning/12 text-warning" : "bg-success/12 text-success"
              }`}
            >
              {rule.paid ? t("flights.baggagePaid") : t("flights.baggageIncluded")}
            </span>
            <span className="text-sm leading-6 text-text-secondary">{t(rule.key)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-5 text-text-muted">{t("flights.baggageAddonsNote")}</p>
    </Card>
  );
}
