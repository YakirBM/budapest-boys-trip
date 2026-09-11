import { Download } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { t } from "@/lib/i18n";
import { TRIP_ID, getActiveMembers, getTrip, requireUser } from "@/lib/data/trip";
import { getMoneyBoard } from "@/lib/data/money";
import { MoneyView } from "@/components/feature/money/MoneyView";
import { currentTripDayClamped } from "@/lib/utils/time";

export const dynamic = "force-dynamic";

/**
 * Money page (docs/06-features/05-finance.md). Server-renders the first board
 * (RLS-scoped), then MoneyView takes over with live queries, offline cache and
 * the entry sheet. Header action = CSV export (route handler, session-checked).
 */
export default async function MoneyPage() {
  const user = await requireUser();
  const [trip, members, board] = await Promise.all([
    getTrip(),
    getActiveMembers(),
    getMoneyBoard(TRIP_ID),
  ]);

  const defaultDay = currentTripDayClamped(
    new Date(),
    trip?.start_date ?? "2026-10-04",
    trip?.end_date ?? "2026-10-08",
  ).dayNumber;
  const activeMembers = members.filter((m) => m.status === "active");
  const isOwner = activeMembers.some((m) => m.user_id === user.id && m.role === "owner");

  return (
    <>
      <Header
        title={t("money.title")}
        subtitle={t("money.subtitle")}
        action={{ icon: Download, label: t("money.exportAria"), href: "/money/export" }}
      />
      <MoneyView
        tripId={TRIP_ID}
        initial={{
          expenses: board.expenses,
          splits: board.splits,
          rates: board.rates,
          balances: board.balances,
          settlements: board.settlements,
        }}
        members={activeMembers}
        userId={user.id}
        isOwner={isOwner}
        defaultDay={defaultDay}
      />
    </>
  );
}
