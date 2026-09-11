"use client";

/**
 * Registers the custom service worker (docs/07-pwa-and-offline.md).
 * Production only — dev stays on plain network to avoid stale-cache confusion.
 * public/sw.js itself is authored by the lead (outbox + caching strategy);
 * registration fails soft (e.g. 404 pre-deploy) without user-visible errors.
 */
import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
        console.warn("[sw] registration failed", error);
      });
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
