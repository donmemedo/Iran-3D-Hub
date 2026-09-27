"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "@/components/Providers";

function LoginInner() {
  const { t, login, signup } = useApp();
  const router = useRouter();
  const next = useSearchParams().get("next") || "/dashboard";

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [form, setForm] = useState({ email: "", password: "", full_name: "", phone: "", company: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const go = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!form.email || !form.password) { setError(t.quote.empty); return; }
    setBusy(true); setError("");
    try {
      if (mode === "login") await login(form.email, form.password);
      else await signup(form);
      router.push(next);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      setError(msg.includes("already") ? t.auth.exists : t.auth.wrong);
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    setBusy(true); setError("");
    try {
      await login("demo@3dhub.ir", "demo1234");
      router.push(next);
    } catch { setError(t.auth.wrong); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-5 py-10">
      <motion.div
        initial={{ opacity: 0, y: 18, filter: "blur(10px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ type: "spring", bounce: 0, duration: 0.55 }}
        className="glass w-full rounded-[2rem] p-7">
        <h1 className="text-[22px] font-extrabold">{t.auth.welcome}</h1>
        <p className="muted mt-2 text-[13.5px]">{t.auth.welcomeSub}</p>

        <div className="hairline mt-6 flex rounded-2xl border p-1">
          {(["login", "signup"] as const).map((m) => (
            <button key={m} onClick={() => { setMode(m); setError(""); }}
              className={`relative flex-1 rounded-xl py-2.5 text-[13px] font-bold transition-colors ${mode === m ? "" : "muted"}`}>
              {mode === m && (
                <motion.span layoutId="auth-pill" className="absolute inset-0 rounded-xl bg-[rgb(var(--line)/0.1)]"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} />
              )}
              <span className="relative">{t.auth[m]}</span>
            </button>
          ))}
        </div>

        <form onSubmit={go} className="mt-5 space-y-3">
          <AnimatePresence initial={false}>
            {mode === "signup" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                className="space-y-3 overflow-hidden">
                <Field placeholder={t.auth.name} value={form.full_name} onChange={set("full_name")} />
                <Field placeholder={t.auth.phone} value={form.phone} onChange={set("phone")} inputMode="tel" />
                <Field placeholder={t.auth.company} value={form.company} onChange={set("company")} />
              </motion.div>
            )}
          </AnimatePresence>

          <Field placeholder={t.auth.email} value={form.email} onChange={set("email")} type="email" autoComplete="email" />
          <Field placeholder={t.auth.password} value={form.password} onChange={set("password")} type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"} />

          {error && <p className="text-[12.5px] font-semibold text-rose-500">{error}</p>}

          <button type="submit" disabled={busy}
            className="pressable w-full rounded-2xl bg-gradient-to-r from-[#00e5c0] to-[#7c5cff] px-6 py-3.5 text-[14.5px] font-extrabold text-[#05060b] shadow-xl shadow-[#7c5cff]/25 disabled:opacity-60">
            {busy ? t.common.loading : t.auth[mode]}
          </button>
        </form>

        <button onClick={demo} disabled={busy}
          className="pressable hairline mt-3 w-full rounded-2xl border py-3 text-[13px] font-bold">
          {t.auth.demo}
        </button>

        <p className="muted mt-5 text-center text-[11.5px] leading-relaxed">{t.auth.terms}</p>
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
