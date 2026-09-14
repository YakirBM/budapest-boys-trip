import { BedDouble, Plane } from "lucide-react";
import { FlightsView } from "@/components/feature/flights/FlightsView";
import { StayView } from "@/components/feature/stay/StayView";
import { Header } from "@/components/layout/Header";
import { SubTabs } from "@/components/ui/SubTabs";
import { getAirlineContacts, getFlightsData } from "@/lib/data/flights";
import { getStayData } from "@/lib/data/stay";
import { TRIP_ID } from "@/lib/data/trip";
import { t } from "@/lib/i18n";

export const metadata = { title: t("travelHub.title") };

export default async function TravelPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const tab = params.tab === "stay" ? "stay" : "flights";
  const flightPayload = tab === "flights"
    ? await Promise.all([getFlightsData(), getAirlineContacts()])
    : null;
  const stay = tab === "stay" ? await getStayData() : null;

  return (
    <>
      <Header title={t("travelHub.title")} subtitle={t("travelHub.subtitle")} />
      <SubTabs
        activeId={tab}
        ariaLabel={t("travelHub.title")}
        tabs={[
          { id: "flights", label: t("travelHub.flights"), href: "/travel?tab=flights", icon: <Plane aria-hidden size={18} /> },
          { id: "stay", label: t("travelHub.stay"), href: "/travel?tab=stay", icon: <BedDouble aria-hidden size={18} /> },
        ]}
      />
      {tab === "flights" && flightPayload ? (
        <FlightsView data={flightPayload[0]} tripId={TRIP_ID} airlinePhone={flightPayload[1].intl} localPhone={flightPayload[1].local} />
      ) : (
        <StayView data={stay} />
      )}
    </>
  );
}
