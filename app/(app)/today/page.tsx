import { Header } from "@/components/layout/Header";
import { t } from "@/lib/i18n";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fetchTodayData } from "@/lib/data/today";
import { currentTripDayClamped } from "@/lib/utils/time";
import { TodayDashboard, type TodaySub } from "@/components/feature/schedule/TodayDashboard";

/** Accommodation-booking deadline — critical pre-trip task (docs/06-features/00). */
const TRIP_START_ISO = "2026-10-04";
const TRIP_END_ISO = "2026-10-08";

interface TodayPageProps {
  searchParams: Promise<{ day?: string; sub?: string }>;
}

const VALID_SUBS: readonly TodaySub[] = ["schedule", "discover", "map"];

/**
 * Today dashboard (docs/14 §3.1 — Tab 1 unified dashboard).
 * RSC parses day+sub, prefetches today + route + map in parallel; the client
 * root TodayDashboard composes the schedule/discover/map panes and shares one
 * QueryClient + realtime channels. Deep-linkable via ?day=N&sub=.
 */
export default async function TodayPage({ searchParams }: TodayPageProps) {
  const params = await searchParams;
  const clamped = currentTripDayClamped(new Date(), TRIP_START_ISO, TRIP_END_ISO);

  const requested = Number(params.day);
  const dayNumber = [1, 2, 3, 4, 5].includes(requested) ? requested : clamped.dayNumber;
  const sub: TodaySub = VALID_SUBS.includes(params.sub as TodaySub)
    ? (params.sub as TodaySub)
    : "schedule";

  const supabase = await getSupabaseServerClient();
  const [{ data: userData }] = await Promise.all([supabase.auth.getUser()]);
  const currentUserId = userData.user?.id ?? null;

  // Discover and Map fetch only when their pane is opened. Their previous
  // eager fetches were discarded and delayed every Schedule navigation.
  const initialToday = await fetchTodayData(supabase, dayNumber);

  const isOwner = initialToday.members.some(
    (m) => m.id === currentUserId && m.role === "owner" && m.active,
  );

  return (
    <>
      <Header title={t("today.title")} />
      <TodayDashboard
        dayNumber={dayNumber}
        defaultDay={clamped.dayNumber}
        sub={sub}
        dayDateIso={initialToday.dayPlan?.date ?? TRIP_START_ISO}
        groupItems={initialToday.items}
        members={initialToday.members}
        currentUserId={currentUserId}
        isOwner={isOwner}
      />
    </>
  );
}
