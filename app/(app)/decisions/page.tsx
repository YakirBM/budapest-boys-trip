import { Header } from "@/components/layout/Header";
import { t } from "@/lib/i18n";
import { TRIP_ID, getActiveMembers, requireUser } from "@/lib/data/trip";
import { getDecisionBoard, reconcileExpiredPolls } from "@/lib/data/decisions";
import { DecisionsView } from "@/components/feature/decisions/DecisionsView";

export const dynamic = "force-dynamic";

/**
 * Decisions & polls page (docs/06-features/09). Lazy deadline reconcile runs
 * server-side before the read so an expired poll is always resolved by the
 * authoritative close_expired_polls() function before anyone sees it.
 */
export default async function DecisionsPage() {
  const user = await requireUser();
  await reconcileExpiredPolls();
  const [board, members] = await Promise.all([getDecisionBoard(TRIP_ID), getActiveMembers()]);

  return (
    <>
      <Header title={t("decisions.title")} subtitle={t("decisions.subtitle")} />
      <DecisionsView
        tripId={TRIP_ID}
        initial={board}
        members={members.filter((m) => m.status === "active")}
        userId={user.id}
      />
    </>
  );
}
