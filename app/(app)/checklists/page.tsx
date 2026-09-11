import { Header } from "@/components/layout/Header";
import { t } from "@/lib/i18n";
import { TRIP_ID, getActiveMembers, requireUser } from "@/lib/data/trip";
import { getChecklistBoard } from "@/lib/data/checklists";
import { ChecklistsView } from "@/components/feature/checklists/ChecklistsView";

export const dynamic = "force-dynamic";

/**
 * Checklists page (docs/06-features/06-checklists.md). The whole board (lists +
 * items + dependency graph) renders server-side first, then ChecklistsView
 * takes over with optimistic toggles, outbox queueing and the offline snapshot.
 */
export default async function ChecklistsPage() {
  const user = await requireUser();
  const [board, members] = await Promise.all([getChecklistBoard(TRIP_ID), getActiveMembers()]);

  return (
    <>
      <Header title={t("checklists.title")} subtitle={t("checklists.subtitle")} />
      <ChecklistsView
        tripId={TRIP_ID}
        initialBoard={board}
        members={members}
        userId={user.id}
      />
    </>
  );
}
