import { OfflineBanner } from "@/components/ui/OfflineBanner";
import { ToastProvider } from "@/components/ui/Toast";
import { AppHeader } from "@/components/layout/AppHeader";
import { BottomNav } from "@/components/layout/BottomNav";
import { QueryProvider } from "@/lib/queries/realtime";
import { TRIP_ID } from "@/lib/data/trip";

/**
 * App shell — centered max-w-md column on desktop (doc 05 out-of-scope note),
 * safe-area aware, with the offline banner, toast host, and bottom nav.
 * Pages compose their own <Header> and content.
 * QueryProvider hosts TanStack Query + the single trip Realtime channel.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider tripId={TRIP_ID}>
      <ToastProvider>
        <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background pt-safe">
          <OfflineBanner />
          <AppHeader />
          <main id="main" className="flex-1 px-4 pb-nav-safe">
            {children}
          </main>
          <BottomNav />
        </div>
      </ToastProvider>
    </QueryProvider>
  );
}
