"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useApp } from "@/components/Providers";
import { Reveal } from "@/components/Reveal";
import { Pill, TiltCard } from "@/components/Bits";
import { api, ApiError } from "@/lib/api";
import type { Dict } from "@/lib/i18n";
import { money, num } from "@/lib/format";

type Hub = {
  id: number; name_fa: string; name_en: string; city_fa: string; city_en: string;
  technologies: string; materials: string; rating: number; reviews_count: number;
  orders_done: number; lead_time_days: number; max_build_mm: number;
  capacity_pct: number; hourly_rate: number; verified: boolean; pro: boolean;
  bio_fa: string; bio_en: string;
};

/** Errors are kept as codes and turned into text at render time, so they follow the language switch. */
function errText(t: Dict, e: string) {
  if (e === "network_error") return t.errors.network;
  return (t.errors as Record<string, string>)[e] ?? t.errors.unknown;
}

export default function HubsPage() {
  const { t, lang } = useApp();
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [q, setQ] = useState("");
  const [tech, setTech] = useState("");
  const [sort, setSort] = useState("rating");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError("");
    const params = new URLSearchParams({ sort });
    if (q.trim()) params.set("q", q.trim());
    if (tech) params.set("technology", tech);
    const id = setTimeout(() => {
      api<Hub[]>(`/api/hubs?${params}`, { signal: ac.signal })
        .then((r) => { if (!ac.signal.aborted) setHubs(r); })
        .catch((e: unknown) => { if (!ac.signal.aborted) setError(e instanceof ApiError ? e.code : "unknown"); })
        .finally(() => { if (!ac.signal.aborted) setLoading(false); });
    }, 200);
    // A newer query (or leaving the page) cancels the request still in flight.
    return () => { clearTimeout(id); ac.abort(); };
  }, [q, tech, sort, attempt]);

  const sorts = useMemo(() => ([
    { code: "rating", label: t.hubs.sortRating },
    { code: "speed", label: t.hubs.sortSpeed },
    { code: "orders", label: t.hubs.sortOrders },
    { code: "price", label: t.hubs.sortPrice },
  ]), [t]);

  return (
    <div className="mx-auto max-w-7xl px-5 pb-20">
      <header className="py-8">
        <h1 className="text-[clamp(1.8rem,4.4vw,3rem)] font-extrabold">{t.hubs.title}</h1>
        <p className="muted mt-3 max-w-2xl text-[15px]">{t.hubs.sub}</p>
      </header>

      <div role="search" className="glass sticky top-24 z-30 mb-6 flex flex-wrap items-center gap-2 rounded-3xl p-3">
        <div className="relative min-w-[200px] flex-1">
          <svg viewBox="0 0 24 24" aria-hidden className="muted pointer-events-none absolute inset-y-0 start-3.5 my-auto h-4 w-4"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.hubs.search}
            aria-label={t.hubs.search} maxLength={80} enterKeyHint="search"
            className="hairline w-full rounded-2xl border bg-transparent py-2.5 pe-4 ps-10 text-[13.5px] outline-none focus:ring-2 focus:ring-[#00e5c0]/50" />
        </div>

        <div role="group" aria-label={t.quote.technology} className="hairline flex rounded-2xl border p-1">
          {["", "FDM", "SLA", "SLS"].map((code) => (
            <button key={code || "all"} type="button" aria-pressed={tech === code} onClick={() => setTech(code)}
              className={`relative rounded-xl px-3 py-1.5 text-[12.5px] font-bold transition-colors ${tech === code ? "" : "muted"}`}>
              {tech === code && (
                <motion.span layoutId="tech-pill" className="absolute inset-0 rounded-xl bg-[rgb(var(--line)/0.1)]"
                  transition={{ type: "spring", bounce: 0, duration: 0.4 }} />
              )}
              <span className="relative">{code || t.hubs.all}</span>
            </button>
          ))}
        </div>

        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t.hubs.sort}
          className="hairline rounded-2xl border bg-[var(--bg-soft)] px-3 py-2.5 text-[12.5px] font-bold outline-none">
          {sorts.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="glass h-56 animate-pulse rounded-3xl" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="glass grid h-52 place-items-center gap-3 rounded-3xl p-6 text-center">
          <p className="text-[14px] font-semibold text-rose-500">{errText(t, error)}</p>
          <button type="button" onClick={() => setAttempt((n) => n + 1)}
            className="pressable rounded-2xl bg-[rgb(var(--line)/0.09)] px-5 py-2.5 text-[13px] font-bold">
            {t.common.retry}
          </button>
        </div>
      ) : hubs.length === 0 ? (
        <div className="glass grid h-52 place-items-center rounded-3xl">
          <p className="muted text-[14px]">{t.hubs.empty}</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {hubs.map((h, i) => (
            <Reveal key={h.id} delay={Math.min(i, 6) * 0.05}>
              <TiltCard className="glass group flex h-full flex-col rounded-3xl p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-[16px] font-extrabold">{lang === "fa" ? h.name_fa : h.name_en}</h3>
                    <div className="muted mt-1 flex items-center gap-1.5 text-[12.5px] font-semibold">
                      <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="10" r="3" /><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" />
                      </svg>
                      {lang === "fa" ? h.city_fa : h.city_en}
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="text-[15px] font-extrabold text-amber-500">★ {num(h.rating, lang)}</div>
                    <div className="muted text-[11px]">{num(h.reviews_count, lang)} {t.hubs.comments}</div>
                  </div>
                </div>

                <p className="muted mt-4 line-clamp-2 min-h-[42px] text-[12.5px] leading-[1.95]">
                  {lang === "fa" ? h.bio_fa : h.bio_en}
                </p>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {h.technologies.split(",").map((tc) => <Pill key={tc} tone="brand">{tc}</Pill>)}
                  {h.verified && <Pill tone="ok">✓ {t.hubs.verified}</Pill>}
                  {h.pro && <Pill tone="warn">{t.hubs.pro}</Pill>}
                </div>

                <div className="hairline mt-5 grid grid-cols-3 gap-2 border-t pt-4 text-center">
                  <Metric k={t.hubs.leadTime} v={`${num(h.lead_time_days, lang)} ${t.quote.days}`} />
                  <Metric k={t.hubs.orders} v={num(h.orders_done.toLocaleString("en-US"), lang)} />
                  <Metric k={t.hubs.build} v={`${num(h.max_build_mm, lang)}mm`} />
                </div>

                <div className="mt-4">
                  <div className="muted mb-1.5 flex items-center justify-between text-[11.5px] font-semibold">
                    <span>{t.hubs.capacity}</span>
                    <span>{num(h.capacity_pct, lang)}{lang === "fa" ? "٪" : "%"}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[rgb(var(--line)/0.12)]">
                    <motion.div
                      initial={{ width: 0 }} whileInView={{ width: `${h.capacity_pct}%` }}
                      viewport={{ once: true }} transition={{ type: "spring", bounce: 0, duration: 0.8 }}
                      className={`h-full rounded-full ${h.capacity_pct > 75 ? "bg-amber-500" : "bg-gradient-to-r from-[#00e5c0] to-[#7c5cff]"}`} />
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="text-[12.5px] font-bold">
                    {money(h.hourly_rate, lang)} <span className="muted font-medium">{t.common.toman}/h</span>
                  </span>
                  <Link href="/quote"
                    className="pressable rounded-xl bg-[rgb(var(--line)/0.09)] px-4 py-2 text-[12.5px] font-bold transition-colors group-hover:bg-gradient-to-r group-hover:from-[#00e5c0] group-hover:to-[#7c5cff] group-hover:text-[#05060b]">
                    {t.hubs.quoteHere}
                  </Link>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="muted text-[10.5px] font-semibold">{k}</div>
      <div className="mt-0.5 text-[13px] font-extrabold tabular-nums">{v}</div>
    </div>
  );
}
