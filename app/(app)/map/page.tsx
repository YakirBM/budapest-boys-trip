import { Header } from "@/components/layout/Header";
import { t } from "@/lib/i18n";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fetchMapData } from "@/lib/data/route";
import { MapView } from "@/components/feature/map/MapView";

/**
 * Map tab (docs/06-features/01 §Map tab). The client map is lazy-loaded;
 * server data and the offline place list remain available independently.
 */
export default async function MapPage() {
  const supabase = await getSupabaseServerClient();
  const initialData = await fetchMapData(supabase);
  return (
    <>
      <Header title={t("map.title")} subtitle={t("map.realMapNote")} />
      <MapView initialData={initialData} />
    </>
  );
}
