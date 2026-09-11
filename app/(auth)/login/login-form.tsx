"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { t } from "@/lib/i18n";

type Stage = "idle" | "sending" | "sent" | "verifying" | "error";

/**
 * Magic-link / email-OTP login (docs/02 §Auth flow, docs/12 §2).
 * The allowlist is enforced server-side (DB trigger) — a rejected email shows
 * the same neutral copy as a successful send so allowlist membership never leaks.
 */
export default function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<Stage>(params.get("error") ? "error" : "idle");

  async function sendLogin(event: React.FormEvent) {
    event.preventDefault();
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
      setStage(error ? "error" : "sent");
    } catch {
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
        setStage("error");
        return;
      }
      window.location.assign("/today");
    } catch {
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
            placeholder="name@gmail.com"
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
                className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-center text-lg tracking-widest text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
              <button
                type="submit"
                disabled={busy}
                className="min-h-12 w-full rounded-xl bg-brand px-4 text-base font-semibold text-brand-contrast disabled:opacity-60"
              >
                {t("login.verify")}
              </button>
            </form>
          </section>
        )}

        {stage === "error" && (
          <p className="mt-4 rounded-xl bg-danger/10 px-4 py-3 text-start text-sm text-danger" role="alert">
            {t("login.error")}
          </p>
        )}

        <p className="mt-6 text-start text-xs text-text-muted">{t("login.noPasswordHint")}</p>
      </div>
    </main>
  );
}
