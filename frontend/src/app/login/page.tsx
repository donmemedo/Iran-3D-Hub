"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "@/components/Providers";
import { ApiError } from "@/lib/api";
import { num } from "@/lib/format";
import type { Dict, Lang } from "@/lib/i18n";

// Demo account only exists on dev servers (SEED_DEMO / DEV); the flag is inlined at build time.
const DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

/** Only same-origin absolute paths. Rejects //evil.com, /\evil.com, https://…, javascript:, and
 *  whitespace/control characters that browsers strip ("/\t/evil.com" would otherwise become "//evil.com"). */
const safeNext = (n: unknown): string =>
  typeof n === "string" && /^\/(?![\/\\])[^\s\u0000-\u001f\\]*$/.test(n) ? n : "/dashboard";

type AuthError = { code: string; wait?: number };

function authMessage(t: Dict, lang: Lang, e: AuthError): string {
  switch (e.code) {
    case "empty":
      return t.quote.empty;
    case "short_password":
      return lang === "fa" ? `رمز عبور باید دست‌کم ${num(8, lang)} نویسه باشد.` : "Password must be at least 8 characters.";
    case "network_error":
      return t.errors.network;
    case "too_many_requests": {
      if (!e.wait) return t.errors.too_many_requests;
      const mins = e.wait >= 60;
      const n = mins ? Math.ceil(e.wait / 60) : Math.ceil(e.wait);
      const when = lang === "fa" ? `${num(n, lang)} ${mins ? "دقیقه" : "ثانیه"}` : `${n} ${mins ? (n === 1 ? "minute" : "minutes") : n === 1 ? "second" : "seconds"}`;
      return lang === "fa" ? `تعداد تلاش‌ها زیاد بود. ${when} دیگر دوباره امتحان کنید.` : `Too many attempts. Try again in ${when}.`;
    }
    default:
      return (t.errors as Record<string, string>)[e.code] ?? t.errors.unknown;
  }
}

const toAuthError = (err: unknown): AuthError =>
  err instanceof ApiError
    ? { code: err.code, wait: err.retryAfter && Number.isFinite(err.retryAfter) && err.retryAfter > 0 ? err.retryAfter : undefined }
    : { code: "unknown" };

function LoginInner() {
  const { t, lang, login, signup } = useApp();
  const router = useRouter();
  const next = useSearchParams().get("next");

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [form, setForm] = useState({ email: "", password: "", full_name: "", phone: "", company: "" });
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const go = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    const email = form.email.trim();
    if (!email || !form.password) { setError({ code: "empty" }); return; }
    if (mode === "signup" && form.password.length < 8) { setError({ code: "short_password" }); return; }
    setBusy(true); setError(null);
    try {
      if (mode === "login") await login(email, form.password);
      else await signup({
        email, password: form.password, full_name: form.full_name.trim(),
        phone: form.phone.trim() || null, company: form.company.trim() || null,
      });
      router.push(safeNext(next));
    } catch (err: unknown) {
      setError(toAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    setBusy(true); setError(null);
    try {
      await login("demo@3dhub.ir", "demo1234");
      router.push(safeNext(next));
    } catch (err: unknown) { setError(toAuthError(err)); } finally { setBusy(false); }
  };

  const described = error ? "auth-error" : undefined;

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 18, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ type: "spring", bounce: 0, duration: 0.55 }}
        className="glass w-full rounded-[2rem] p-7">
        <h1 className="text-[22px] font-extrabold">{t.auth.welcome}</h1>
        <p className="muted mt-2 text-[13.5px]">{t.auth.welcomeSub}</p>

        <div role="group" aria-label={`${t.auth.login} / ${t.auth.signup}`} className="hairline mt-6 flex rounded-2xl border p-1">
          {(["login", "signup"] as const).map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); setError(null); }}
              className={`relative flex-1 rounded-xl py-2.5 text-[13px] font-bold transition-colors ${mode === m ? "" : "muted"}`}>
              {mode === m && (
                <motion.span layoutId="auth-pill" className="absolute inset-0 rounded-xl bg-[rgb(var(--line)/0.1)]"
                  transition={{ type: "spring", bounce: 0, duration: 0.4 }} />
              )}
              <span className="relative">{t.auth[m]}</span>
            </button>
          ))}
        </div>

        <form onSubmit={go} noValidate className="mt-5 space-y-3">
          <AnimatePresence initial={false}>
            {mode === "signup" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                className="space-y-3 overflow-hidden">
                <Field name="name" aria-label={t.auth.name} placeholder={t.auth.name} value={form.full_name} onChange={set("full_name")}
                  autoComplete="name" maxLength={120} />
                <Field name="phone" aria-label={t.auth.phone} placeholder={t.auth.phone} value={form.phone} onChange={set("phone")}
                  type="tel" inputMode="tel" autoComplete="tel" maxLength={32} />
                <Field name="company" aria-label={t.auth.company} placeholder={t.auth.company} value={form.company} onChange={set("company")}
                  autoComplete="organization" maxLength={120} />
              </motion.div>
            )}
          </AnimatePresence>

          <Field name="email" aria-label={t.auth.email} placeholder={t.auth.email} value={form.email} onChange={set("email")}
            type="email" autoComplete="email" required maxLength={254}
            aria-invalid={error ? true : undefined} aria-describedby={described} />
          <Field name="password" aria-label={t.auth.password} placeholder={t.auth.password} value={form.password} onChange={set("password")}
            type="password" required maxLength={128} minLength={mode === "signup" ? 8 : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            aria-invalid={error ? true : undefined} aria-describedby={described} />

          {error && <p id="auth-error" role="alert" className="text-[12.5px] font-semibold text-rose-600 dark:text-rose-400">{authMessage(t, lang, error)}</p>}

          <button type="submit" disabled={busy} aria-busy={busy}
            className="pressable w-full rounded-2xl bg-gradient-to-r from-[#00e5c0] to-[#7c5cff] px-6 py-3.5 text-[14.5px] font-extrabold text-[#05060b] shadow-xl shadow-[#7c5cff]/25 disabled:opacity-60">
            {busy ? t.common.loading : t.auth[mode]}
          </button>
        </form>

        {DEMO && (
          <button type="button" onClick={demo} disabled={busy}
            className="pressable hairline mt-3 w-full rounded-2xl border py-3 text-[13px] font-bold disabled:opacity-60">
            {t.auth.demo}
          </button>
        )}

        <p className="muted mt-5 text-center text-[11.5px] leading-relaxed">{t.auth.terms}</p>
        <p className="muted mt-2 flex justify-center gap-3 text-[11.5px]">
          <Link href="/terms" className="underline">{t.footer.terms}</Link>
          <Link href="/privacy" className="underline">{t.footer.privacy}</Link>
        </p>
        <p className="muted mt-3 text-center text-[12.5px]">
          <Link href="/" className="underline">{t.common.back}</Link>
        </p>
      </motion.div>
    </div>
  );
}

function Field(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input {...props}
      className="hairline w-full rounded-2xl border bg-transparent px-4 py-3 text-[13.5px] outline-none transition-shadow focus:ring-2 focus:ring-[#00e5c0]/50" />
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="grid h-[60vh] place-items-center" />}>
      <LoginInner />
    </Suspense>
  );
}
