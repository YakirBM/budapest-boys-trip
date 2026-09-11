"use client";

import { CircleAlert, ScanLine, TicketCheck, TramFront } from "lucide-react";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";

/** Static validation explainer (doc 04 §Validation explainer, Hebrew via i18n). */
export function ValidationCard() {
  const rows: { key: Parameters<typeof t>[0]; icon: React.ReactNode }[] = [
    { key: "transit.validationMetro", icon: <TramFront aria-hidden size={16} className="text-cat-transit" /> },
    { key: "transit.validationOnboard", icon: <TicketCheck aria-hidden size={16} className="text-cat-transit" /> },
    { key: "transit.validationDigital", icon: <ScanLine aria-hidden size={16} className="text-cat-transit" /> },
    { key: "transit.validationInspectors", icon: <CircleAlert aria-hidden size={16} className="text-warning" /> },
  ];
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-text-primary">{t("transit.validationTitle")}</h2>
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-start gap-2 rounded-xl border border-border px-3 py-2">
            <span aria-hidden className="mt-0.5 shrink-0">
              {row.icon}
            </span>
            <span className="text-sm leading-6 text-text-secondary">{t(row.key)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
