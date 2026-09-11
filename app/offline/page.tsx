import { WifiOff } from "lucide-react";
import { t } from "@/lib/i18n";

/**
 * /offline — static navigation fallback served by the service worker when an
 * uncached page is requested offline (docs/07-pwa-and-offline.md). Must stay
 * fully static so it can be precached.
 */
export default function OfflinePage() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-warning/12">
        <WifiOff aria-hidden size={32} className="text-warning" />
      </span>
      <h1 className="text-2xl font-bold text-text-primary">{t("offline.title")}</h1>
      <p className="max-w-xs text-sm leading-6 text-text-secondary">{t("offline.body")}</p>
      <a
        href="/today"
        className="mt-2 inline-flex min-h-12 items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-brand-contrast transition-opacity active:opacity-80"
      >
        {t("offline.goToday")}
      </a>
    </div>
  );
}
