import { Header } from "@/components/layout/Header";
import { t } from "@/lib/i18n";
import { TRIP_ID, getActiveMembers, getTrip, requireUser } from "@/lib/data/trip";
import { getMediaBoard } from "@/lib/data/media";
import { MediaView } from "@/components/feature/media/MediaView";
import { currentTripDayClamped } from "@/lib/utils/time";

export const dynamic = "force-dynamic";

/**
 * Media wall page (docs/06-features/07). Server renders metadata rows only;
 * thumbnails are signed in batches client-side (in-memory TTL cache) and never
 * persisted. Uploads are photos-only, ≤ 15 MB, EXIF stripped by re-encode.
 */
export default async function MediaPage() {
  const user = await requireUser();
  const [trip, members, board] = await Promise.all([
    getTrip(),
    getActiveMembers(),
    getMediaBoard(TRIP_ID),
  ]);

  const clamped = currentTripDayClamped(
    new Date(),
    trip?.start_date ?? "2026-10-04",
    trip?.end_date ?? "2026-10-08",
  );

  return (
    <>
      <Header title={t("media.title")} subtitle={t("media.subtitle")} />
      <MediaView
        tripId={TRIP_ID}
        initial={board}
        members={members.filter((m) => m.status === "active")}
        userId={user.id}
        defaultDay={clamped.dayNumber}
        isPreTrip={clamped.isPreTrip}
      />
    </>
  );
}
