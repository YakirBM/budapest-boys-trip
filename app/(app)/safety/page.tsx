import { Header } from "@/components/layout/Header";
import { t } from "@/lib/i18n";
import { TRIP_ID } from "@/lib/data/trip";
import { getSafetyData } from "@/lib/data/safety";
import { SafetyView } from "@/components/feature/safety/SafetyView";

export const metadata = { title: t("safety.title") };

/**
 * Medical & safety (docs/06-features/08-medical-safety.md) — exactly four
 * cards, fully offline-capable, zero location persistence.
 */
export default async function SafetyPage() {
  const data = await getSafetyData();
  const emergency = data.contacts.find((contact) => contact.kind === "emergency");

  return (
    <>
      <Header title={t("safety.title")} subtitle={t("safety.subtitle")} />
      <SafetyView data={data} tripId={TRIP_ID} emergencyPhone={emergency?.phone ?? "112"} />
    </>
  );
}
