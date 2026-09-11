import { Header } from "@/components/layout/Header";
import { t } from "@/lib/i18n";
import { TRIP_ID } from "@/lib/data/trip";
import { getAirlineContacts, getFlightsData } from "@/lib/data/flights";
import { FlightsView } from "@/components/feature/flights/FlightsView";

export const metadata = { title: t("flights.title") };

/**
 * Flights command center (docs/06-features/02-flights.md). RSC loads the
 * verified flight facts; the client view caches the whole screen for offline.
 */
export default async function FlightsPage() {
  const [data, contacts] = await Promise.all([getFlightsData(), getAirlineContacts()]);

  return (
    <>
      <Header title={t("flights.title")} subtitle={t("flights.subtitle")} />
      <FlightsView
        data={data}
        tripId={TRIP_ID}
        airlinePhone={contacts.intl}
        localPhone={contacts.local}
      />
    </>
  );
}
