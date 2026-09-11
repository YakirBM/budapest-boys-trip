"use client";

import { Check } from "lucide-react";
import { t } from "@/lib/i18n";
import { Card } from "@/components/ui/Card";

/** Static agreed-requirements filter (doc 03-feature §requirements, Hebrew via i18n). */
export function RequirementsCard() {
  const items: Parameters<typeof t>[0][] = [
    "stay.reqBeds",
    "stay.reqDistrict",
    "stay.reqWalk",
    "stay.reqWifi",
    "stay.reqHeating",
    "stay.reqSelfCheckin",
    "stay.reqWashing",
  ];
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-text-primary">{t("stay.requirementsTitle")}</h2>
      <ul className="flex flex-col gap-1.5">
        {items.map((key) => (
          <li key={key} className="flex items-start gap-2 text-sm leading-6 text-text-secondary">
            <Check aria-hidden size={16} className="mt-1 shrink-0 text-success" />
            {t(key)}
          </li>
        ))}
      </ul>
    </Card>
  );
}
