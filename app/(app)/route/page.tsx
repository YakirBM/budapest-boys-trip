import { Header } from "@/components/layout/Header";
import { t } from "@/lib/i18n";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fetchRouteData } from "@/lib/data/route";
import { currentTripDayClamped } from "@/lib/utils/time";
import { RouteView } from "@/components/feature/route/RouteView";

const TRIP_START_ISO = "2026-10-04";
const TRIP_END_ISO = "2026-10-08";

interface RoutePageProps {
  searchParams: Promise<{ day?: string; tab?: string }>;
}

/**
 * Route & Places (docs/06-features/01-route-and-places.md): day builder +
 * places inbox as server-rendered tabs. The whole-trip dataset is small, so a
 * single fetch feeds both tabs and the map rollups.
 */
export default async function RoutePage({ searchParams }: RoutePageProps) {
  const params = await searchParams;
  const clamped = currentTripDayClamped(new Date(), TRIP_START_ISO, TRIP_END_ISO);

  const requested = Number(params.day);
  const dayNumber = [1, 2, 3, 4, 5].includes(requested) ? requested : clamped.dayNumber;
  const tab = params.tab === "places" ? "places" : "day";

  const supabase = await getSupabaseServerClient();
  const initialData = await fetchRouteData(supabase, dayNumber);

  return (
    <>
      <Header
        title={t("route.title")}
        subtitle={tab === "places" ? t("route.library.title") : undefined}
      />
      <RouteView
        selectedDay={dayNumber}
        defaultDay={clamped.dayNumber}
        tab={tab}
        initialData={initialData}
      />
    </>
  );
}
