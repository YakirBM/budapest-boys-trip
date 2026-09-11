import { Header } from "@/components/layout/Header";
import { t } from "@/lib/i18n";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fetchTodayData, fetchTodayFeed } from "@/lib/data/today";
import { currentTripDayClamped, daysUntil, todayInTz, TZ_BUDAPEST } from "@/lib/utils/time";
import { TodayView } from "@/components/feature/today/TodayView";

/** Accommodation-booking deadline — critical pre-trip task (docs/06-features/00). */
const ACCOMMODATION_DEADLINE_ISO = "2026-09-20";
const TRIP_START_ISO = "2026-10-04";
const TRIP_END_ISO = "2026-10-08";

interface TodayPageProps {
  searchParams: Promise<{ day?: string }>;
}

/**
 * Today dashboard (docs/06-features/00-today-dashboard.md).
 * RSC fetches the selected day + feed; TodayView owns the interactive leaves.
 */
export default async function TodayPage({ searchParams }: TodayPageProps) {
  const params = await searchParams;
  const clamped = currentTripDayClamped(new Date(), TRIP_START_ISO, TRIP_END_ISO);

  const requested = Number(params.day);
  const dayNumber = [1, 2, 3, 4, 5].includes(requested) ? requested : clamped.dayNumber;

  const supabase = await getSupabaseServerClient();
  const [initialToday, initialFeed] = await Promise.all([
    fetchTodayData(supabase, dayNumber),
    fetchTodayFeed(supabase, dayNumber),
  ]);

  return (
    <>
      <Header
        title={t("today.title")}
        subtitle={todayInTz(TZ_BUDAPEST) > TRIP_END_ISO ? t("today.tripDone") : undefined}
      />
      <TodayView
        dayNumber={dayNumber}
        defaultDay={clamped.dayNumber}
        isPreTrip={clamped.isPreTrip}
        isPostTrip={clamped.isPostTrip}
        tripStartIso={TRIP_START_ISO}
        tripEndIso={TRIP_END_ISO}
        accommodationDaysLeft={Math.max(0, daysUntil(ACCOMMODATION_DEADLINE_ISO))}
        initialToday={initialToday}
        initialFeed={initialFeed}
      />
    </>
  );
}
