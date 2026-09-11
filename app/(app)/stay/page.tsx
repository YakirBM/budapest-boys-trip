import { Header } from "@/components/layout/Header";
import { t } from "@/lib/i18n";
import { getStayData } from "@/lib/data/stay";
import { StayView } from "@/components/feature/stay/StayView";

export const metadata = { title: t("stay.title") };

/**
 * Stay screen (docs/06-features/03-accommodation.md). Mode A (booking mission +
 * candidates) until a booked row exists, then Mode B (home base).
 */
export default async function StayPage() {
  const data = await getStayData();

  return (
    <>
      <Header title={t("stay.title")} subtitle={t("stay.deadline")} />
      <StayView data={data} />
    </>
  );
}
