"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useApp } from "@/components/Providers";
import { Reveal } from "@/components/Reveal";
import { Counter, Pill } from "@/components/Bits";
import { api, ApiError, post } from "@/lib/api";
import type { Dict } from "@/lib/i18n";
import { money, num } from "@/lib/format";

type Row = {
  order: { public_id: string; status: string; amount: number; address: string; note: string; created_at: string };
  quote: { filename: string; quantity: number; material_slug: string; technology: string; volume_cm3: number; lead_time_days: number } | null;
  hub: { name_fa: string; name_en: string; city_fa: string; city_en: string } | null;
  step: number;
  flow: string[];
};

const errCode = (e: unknown) => (e instanceof ApiError ? e.code : "unknown");

/** Errors are kept as codes and turned into text at render time, so they follow the language switch. */
function errText(t: Dict, code: string) {
  if (code === "network_error") return t.errors.network;
  return (t.errors as Record<string, string>)[code] ?? t.errors.unknown;
}

export default function Dashboard() {
  const { t, lang, user, ready } = useApp();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState<{ id: string; code: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const ctl = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    ctl.current?.abort();
    const ac = new AbortController();
    ctl.current = ac;
    setLoadError("");
    api<Row[]>("/api/orders?limit=50", { signal: ac.signal })
      .then((r) => { if (!ac.signal.aborted) setRows(r); })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        const code = errCode(e);
        if (code === "not_authenticated" || code === "invalid_token") { router.replace("/login?next=/dashboard"); return; }
        setLoadError(code);
      })
      .finally(() => { if (!ac.signal.aborted) setLoading(false); });
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    if (!user) { router.replace("/login?next=/dashboard"); return; }
    load();
    return () => ctl.current?.abort();
  }, [ready, user, load, router]);

  const isAdmin = user?.role === "admin";

  const act = async (id: string, what: "advance" | "cancel") => {
    if (pending) return;
    setPending(id);
    setActionError(null);
    try {
      await post(`/api/orders/${encodeURIComponent(id)}/${what}`, {});
    } catch (e: unknown) {
      setActionError({ id, code: errCode(e) });
    } finally {
      setPending(null);
    }
    load(); // refresh either way: on order_changed the list is what is out of date
  };

  const total = rows.reduce((s, r) => s + r.order.amount, 0);
  const active = rows.filter((r) => !["delivered", "canceled"].includes(r.order.status)).length;
  const done = rows.filter((r) => r.order.status === "delivered").length;

  if (!ready || (ready && !user)) {
    return <div className="muted grid h-[50vh] place-items-center text-[14px]">{t.common.loading}</div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-5 pb-20">
      <header className="flex flex-wrap items-end justify-between gap-4 py-8">
        <div>
          <h1 className="text-[clamp(1.8rem,4.4vw,3rem)] font-extrabold">{t.dash.title}</h1>
          <p className="muted mt-3 text-[15px]">{t.dash.sub}</p>
        </div>
        <Link href="/quote"
          className="pressable rounded-2xl bg-gradient-to-r from-[#00e5c0] to-[#7c5cff] px-5 py-3 text-[13.5px] font-extrabold text-[#05060b] shadow-lg shadow-[#7c5cff]/25">
          {t.nav.quote}
        </Link>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label={t.dash.total} value={<><Counter to={total} /> <span className="muted text-sm">{t.common.toman}</span></>} />
        <Card label={t.dash.orders} value={<Counter to={rows.length} />} />
        <Card label={t.dash.active} value={<Counter to={active} />} />
        <Card label={t.dash.done} value={<Counter to={done} />} />
      </div>

      <h2 className="mb-4 mt-10 text-[17px] font-extrabold">{t.dash.orders}</h2>

      {loadError && (
        <div role="alert" className="glass mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl px-6 py-4">
          <p className="text-[13.5px] font-semibold text-rose-600 dark:text-rose-400">{errText(t, loadError)}</p>
          <button type="button" onClick={() => { setLoading(true); load(); }}
            className="pressable rounded-xl bg-[rgb(var(--line)/0.09)] px-4 py-2 text-[12.5px] font-bold">
            {t.common.retry}
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-3" aria-busy="true">{[...Array(3)].map((_, i) => <div key={i} className="glass h-40 animate-pulse rounded-3xl" />)}</div>
      ) : rows.length === 0 ? (
        loadError ? null : <div className="glass grid place-items-center rounded-3xl p-12 text-center">
          <p className="muted text-[14px]">{t.dash.empty}</p>
          <Link href="/quote" className="pressable mt-5 rounded-2xl bg-gradient-to-r from-[#00e5c0] to-[#7c5cff] px-6 py-3 text-[13.5px] font-extrabold text-[#05060b]">
            {t.dash.emptyCta}
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => {
            const canceled = r.order.status === "canceled";
            const open = !canceled && r.order.status !== "delivered";
            const cancelable = open && r.order.status !== "shipped"; // the server refuses later cancels
            const showActions = cancelable || (isAdmin && open);
            const statusKey = r.order.status as keyof typeof t.dash.status;
            return (
              <Reveal key={r.order.public_id} delay={Math.min(i, 5) * 0.05}>
                <div className="glass rounded-3xl p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[13px] font-bold">{r.order.public_id}</span>
                        <Pill tone={canceled ? "warn" : r.order.status === "delivered" ? "ok" : "brand"}>
                          {t.dash.status[statusKey] ?? r.order.status}
                        </Pill>
                      </div>
                      <div className="muted mt-2 truncate text-[12.5px]">
                        {r.quote?.filename} • {num(r.quote?.quantity ?? 1, lang)}× •{" "}
                        {r.quote?.technology} / {r.quote?.material_slug}
                      </div>
                      {r.hub && (
                        <div className="muted mt-1 text-[12.5px]">
                          {lang === "fa" ? r.hub.name_fa : r.hub.name_en} — {lang === "fa" ? r.hub.city_fa : r.hub.city_en}
                        </div>
                      )}
                    </div>
                    <div className="text-end">
                      <div className="text-gradient text-[19px] font-extrabold tabular-nums">
                        {money(r.order.amount, lang)}
                      </div>
                      <div className="muted text-[11.5px] font-semibold">{t.common.toman}</div>
                    </div>
                  </div>

                  {!canceled && (
                    <div className="mt-6" aria-hidden>
                      <div className="flex items-center gap-1">
                        {r.flow.map((s, idx) => (
                          <div key={s} className="flex flex-1 items-center gap-1">
                            <motion.span
                              initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                              transition={{ type: "spring", bounce: 0, duration: 0.4, delay: idx * 0.04 }}
                              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-extrabold ${idx <= r.step ? "bg-gradient-to-br from-[#00e5c0] to-[#7c5cff] text-[#05060b]" : "bg-[rgb(var(--line)/0.1)] muted"}`}>
                              {idx < r.step ? "✓" : num(idx + 1, lang)}
                            </motion.span>
                            {idx < r.flow.length - 1 && (
                              <span className={`h-[2px] flex-1 rounded-full ${idx < r.step ? "bg-gradient-to-r from-[#00e5c0] to-[#7c5cff]" : "bg-[rgb(var(--line)/0.1)]"}`} />
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="muted mt-2 flex justify-between text-[10.5px] font-semibold">
                        <span>{t.dash.status.pending_payment}</span>
                        <span>{t.dash.status.delivered}</span>
                      </div>
                    </div>
                  )}

                  {r.order.address && (
                    <div className="muted hairline mt-5 border-t pt-4 text-[12.5px] leading-relaxed">
                      <span className="font-bold">{t.quote.address}:</span> {r.order.address}
                    </div>
                  )}

                  {showActions && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {isAdmin && (
                        <button type="button" onClick={() => act(r.order.public_id, "advance")} disabled={pending !== null}
                          className="pressable rounded-xl bg-[rgb(var(--line)/0.09)] px-4 py-2 text-[12.5px] font-bold disabled:opacity-60">
                          {t.dash.advance}
                        </button>
                      )}
                      {cancelable && (
                        <button type="button" onClick={() => act(r.order.public_id, "cancel")} disabled={pending !== null}
                          className="pressable rounded-xl px-4 py-2 text-[12.5px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 disabled:opacity-60">
                          {t.dash.cancel}
                        </button>
                      )}
                    </div>
                  )}

                  {actionError?.id === r.order.public_id && (
                    <p role="alert" className="mt-3 text-[12.5px] font-semibold text-rose-600 dark:text-rose-400">{errText(t, actionError.code)}</p>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="glass rounded-3xl p-5">
      <div className="muted text-[12px] font-semibold">{label}</div>
      <div className="mt-2 text-[clamp(1.2rem,3vw,1.7rem)] font-extrabold tabular-nums">{value}</div>
    </div>
  );
}
