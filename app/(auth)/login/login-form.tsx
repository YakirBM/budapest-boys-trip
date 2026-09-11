"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

type Stage = "idle" | "sending" | "sent" | "verifying" | "error";

/**
 * Magic-link / email-OTP login (docs/02 §Auth flow, docs/12 §2).
 * The allowlist is enforced server-side (DB trigger) — a rejected email shows
 * the same neutral copy as a successful send so allowlist membership never leaks.
 * On mount we instantiate the browser client so an email-link hash session
 * (#access_token=… from implicit-flow confirmations) is consumed immediately.
 */
export default function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<Stage>(params.get("error") ? "error" : "idle");
  // Link-exchange failures (?error=auth) need different guidance than a wrong code:
  // the link is single-use and bound to the requesting browser.
  const [errorKind, setErrorKind] = useState<"link" | "action">(params.get("error") ? "link" : "action");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    (async () => {
      // Admin-generated / fallback email links arrive in implicit form
      // (#access_token=…) — consume them manually (PKCE projects ignore hashes).
      const hash = window.location.hash;
      const hashParams = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : "");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        if (!error) {
          window.history.replaceState(null, "", window.location.pathname);
          // Let cookie writes settle before the full navigation (avoids a rare
          // ERR_FAILED when the middleware refresh races the first request).
          window.setTimeout(() => window.location.replace("/today"), 300);
          return;
        }
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (session) window.location.replace("/today");
    })();
  }, []);

  async function sendLogin(event?: React.FormEvent) {
    event?.preventDefault();
    if (email.trim() === "") return;
    setStage("sending");
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: true,
        },
      });
      if (error) setErrorKind("action");
      setStage(error ? "error" : "sent");
    } catch {
      setErrorKind("action");
      setStage("error");
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setStage("verifying");
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "email",
      });
      if (error) {
        setErrorKind("action");
        setStage("error");
        return;
      }
      window.location.assign("/today");
    } catch {
      setErrorKind("action");
      setStage("error");
    }
  }

  const busy = stage === "sending" || stage === "verifying";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-6 shadow-sm">
        <h1 className="text-start text-2xl font-bold text-text-primary">{t("login.title")}</h1>
        <p className="mt-1 text-start text-sm text-text-secondary">{t("login.subtitle")}</p>

        <form onSubmit={sendLogin} className="mt-6 flex flex-col gap-3">
          <label htmlFor="email" className="text-start text-sm font-medium text-text-primary">
            {t("login.emailLabel")}
          </label>
          <input
            id="email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("login.emailPlaceholder")}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-start text-base text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand"
          />
          <button
            type="submit"
            disabled={busy}
            className="min-h-12 w-full rounded-xl bg-brand px-4 text-base font-semibold text-brand-contrast disabled:opacity-60"
          >
            {busy ? t("common.loading") : t("login.sendCode")}
          </button>
        </form>

        {stage === "sent" && (
          <section className="mt-6 flex flex-col gap-3 border-t border-border pt-4">
            <p className="text-start text-sm text-text-secondary" role="status">
              {t("login.codeSent")}
            </p>
            <form onSubmit={verifyCode} className="flex flex-col gap-3">
              <label htmlFor="code" className="text-start text-sm font-medium text-text-primary">
                {t("login.codeLabel")}
              </label>
              <input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                dir="ltr"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t("login.codePlaceholder")}
                className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-center text-lg tracking-widest text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
              <button
                type="submit"
                disabled={busy}
                className="min-h-12 w-full rounded-xl bg-brand px-4 text-base font-semibold text-brand-contrast disabled:opacity-60"
              >
                {busy ? t("common.loading") : t("login.verify")}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendLogin()}
                className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base font-semibold text-text-secondary disabled:opacity-60"
              >
                {t("login.resend")}
              </button>
            </form>
          </section>
        )}

        {stage === "error" && (
          <p className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-start text-sm text-danger" role="alert">
            {t(errorKind === "link" ? "login.errorLink" : "login.error")}
          </p>
        )}

        <p className="mt-6 text-start text-xs text-text-muted">{t("login.noPasswordHint")}</p>
      </div>

      <section
        aria-label={t("login.howTitle")}
        className="mt-3 w-full max-w-sm rounded-2xl bg-surface p-6 shadow-sm"
      >
        <h2 className="text-start text-lg font-bold text-text-primary">{t("login.howTitle")}</h2>
        <ol className="mt-3 flex flex-col gap-3">
          {(
            [
              { n: "1", title: t("login.step1Title"), body: t("login.step1Body") },
              { n: "2", title: t("login.step2Title"), body: t("login.step2Body") },
              { n: "3", title: t("login.step3Title"), body: t("login.step3Body") },
            ] as const
          ).map((step) => (
            <li key={step.n} className="flex items-start gap-3">
              <span
                aria-hidden
                className="tnum grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand-strong"
              >
                {step.n}
              </span>
              <span className="min-w-0">
                <span className="block text-start text-sm font-bold text-text-primary">{step.title}</span>
                <span className="block text-start text-sm leading-6 text-text-secondary">{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 rounded-xl bg-warning/10 px-3 py-2 text-start text-xs leading-5 text-text-secondary">
          <span className="font-bold text-warning">{t("login.sameBrowserTitle")}: </span>
          {t("login.sameBrowserBody")}
        </p>
      </section>
    </main>
  );
}
