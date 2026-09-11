import { Header } from "@/components/layout/Header";
import { t } from "@/lib/i18n";
import { getTransitData } from "@/lib/data/transit";
import { TransitView } from "@/components/feature/transit/TransitView";

export const metadata = { title: t("transit.title") };

/** Transit hub (docs/06-features/04-transportation.md). */
export default async function TransitPage() {
  const data = await getTransitData();

  return (
    <>
      <Header title={t("transit.title")} subtitle={t("transit.ticketsSource")} />
      <TransitView data={data} />
    </>
  );
}
