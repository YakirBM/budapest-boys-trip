"use client";

/**
 * ThemeProvider — applies the auto-dark/manual-override theme on <html>
 * (docs/05-ui-ux-design-system.md §3). SSR default is light; the inline
 * THEME_INIT_SCRIPT in the root layout prevents a flash before hydration.
 * Theme flips animate color/background/border only, ≤200ms, via the
 * `.theme-transition` class (disabled under prefers-reduced-motion by CSS).
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AUTO_RECHECK_MS,
  DARK_CLASS,
  THEME_OVERRIDE_KEY,
  THEME_TRANSITION_CLASS,
  isOverrideActive,
  parseOverride,
  resolveTheme,
  type ResolvedTheme,
  type ThemeOverride,
  type ThemePreference,
} from "./logic";

export type { ResolvedTheme, ThemePreference } from "./logic";

interface ThemeContextValue {
  /** What the user picked: light, dark, or system (auto-dark). */
  preference: ThemePreference;
  /** What is currently applied to <html>. */
  resolvedTheme: ResolvedTheme;
  /** Set light/dark (override until next sunrise) or system (resume auto). */
  setTheme: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): { preference: ThemePreference; override: ThemeOverride | null } {
  try {
    const raw = window.localStorage.getItem(THEME_OVERRIDE_KEY);
    const override = parseOverride(raw);
    if (override && isOverrideActive(override, new Date())) {
      return { preference: override.mode, override };
    }
  } catch {
    // localStorage unavailable — stay on auto
  }
  return { preference: "system", override: null };
}

function applyThemeClass(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle(DARK_CLASS, resolved === "dark");
}

function flashTransition(): void {
  const root = document.documentElement;
  root.classList.add(THEME_TRANSITION_CLASS);
  window.setTimeout(() => root.classList.remove(THEME_TRANSITION_CLASS), 250);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>("system");
  const [override, setOverride] = useState<ThemeOverride | null>(null);
  const firstSync = useRef(true);

  // Initial sync from storage (post-mount; the inline script already hinted).
  useEffect(() => {
    const stored = readStoredPreference();
    setPreference(stored.preference);
    setOverride(stored.override);
  }, []);

  const resolved = resolveTheme(preference, override, new Date());

  // Apply the class whenever the resolution changes; animate only real flips.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.classList.contains(DARK_CLASS) ? "dark" : "light";
    applyThemeClass(resolved);
    if (firstSync.current) {
      firstSync.current = false;
      return;
    }
    if (previous !== resolved) flashTransition();
  }, [resolved]);

  // Re-evaluate every minute: sunset/sunrise boundaries and override expiry.
  useEffect(() => {
    const tick = () => setOverride((current) => ({ ...(current ?? { mode: "light", setAt: 0 }) }));
    const id = window.setInterval(tick, AUTO_RECHECK_MS);
    return () => window.clearInterval(id);
  }, []);

  const setTheme = useCallback((next: ThemePreference) => {
    setPreference(next);
    if (next === "system") {
      try {
        window.localStorage.removeItem(THEME_OVERRIDE_KEY);
      } catch {
        // ignore
      }
      setOverride(null);
      return;
    }
    const overrideValue: ThemeOverride = { mode: next, setAt: Date.now() };
    try {
      window.localStorage.setItem(THEME_OVERRIDE_KEY, JSON.stringify(overrideValue));
    } catch {
      // ignore
    }
    setOverride(overrideValue);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolvedTheme: resolved, setTheme }),
    [preference, resolved, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
