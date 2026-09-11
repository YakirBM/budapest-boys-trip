import type { MetadataRoute } from "next";
import { t } from "@/lib/i18n";

/**
 * PWA manifest per docs/07-pwa-and-offline.md — theme/background colors aligned
 * with the design tokens in docs/05-ui-ux-design-system.md §4: background =
 * warm paper #f7f4ee, theme = Budapest teal #0e7c74.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: t("meta.title"),
    short_name: t("meta.shortTitle"),
    lang: "he",
    dir: "rtl",
    start_url: "/today",
    scope: "/",
    display: "standalone",
    background_color: "#f7f4ee",
    theme_color: "#0e7c74",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
