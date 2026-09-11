/*
 * Pre-paint theme bootstrap (docs/05 §3) — static file, no user data, loaded
 * synchronously from app/layout.tsx before first paint. Avoids inline scripts
 * (docs/04 §7 bans dangerouslySetInnerHTML).
 */
(function () {
  try {
    var k = "theme-override";
    var dark = false;
    var raw = null;
    try {
      raw = localStorage.getItem(k);
    } catch {
      raw = null;
    }
    if (raw === "light" || raw === "dark") {
      dark = raw === "dark";
    } else if (raw) {
      try {
        var o = JSON.parse(raw);
        dark = !!(o && o.mode === "dark");
      } catch {
        dark = false;
      }
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      dark = true;
    }
    if (dark) {
      document.documentElement.classList.add("dark");
    }
  } catch {
    // never block paint
  }
})();
