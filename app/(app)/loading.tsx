import { Skeleton } from "@/components/ui/Skeleton";
import { t } from "@/lib/i18n";

/** Immediate route feedback while a dynamic RSC payload is loading. */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-4 py-4" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-52 max-w-full" />
        </div>
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <span className="sr-only">{t("common.loading")}</span>
    </div>
  );
}
