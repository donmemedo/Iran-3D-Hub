"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "@/components/Providers";
import { Reveal } from "@/components/Reveal";
import { Counter, Pill, TiltCard } from "@/components/Bits";
import { api } from "@/lib/api";
import { money, num } from "@/lib/format";

type Stats = { hubs: number; cities: number; orders_done: number; avg_rating: number; avg_lead_days: number; materials: number; free_capacity_pct: number };
type Material = { slug: string; name_fa: string; name_en: string; technology: string; price_per_cm3: number; color_hex: string; desc_fa: string; desc_en: string };

// three.js stays out of the initial bundle; the hero paints first and the scene streams in.
const Hero3D = dynamic(() => import("@/components/Hero3D").then((m) => m.Hero3D), {
  ssr: false,
  loading: () => <div className="absolute inset-0" aria-hidden />,
});

const CITIES_FA = ["تهران", "کرج", "اصفهان", "مشهد", "شیراز", "تبریز", "قم", "اهواز", "رشت", "یزد", "کرمان", "ارومیه"];
const CITIES_EN = ["Tehran", "Karaj", "Isfahan", "Mashhad", "Shiraz", "Tabriz", "Qom", "Ahvaz", "Rasht", "Yazd", "Kerman", "Urmia"];

export default function Home() {
  const { t, lang, rtl } = useApp();
  const [stats, setStats] = useState<Stats | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [faq, setFaq] = useState<number | null>(0);

  useEffect(() => {
    api<Stats>("/api/stats").then(setStats).catch(() => {});
    api<Material[]>("/api/materials").then(setMaterials).catch(() => {});
  }, []);

  const steps = [
    { n: "01", title: t.steps.s1t, body: t.steps.s1b },
    { n: "02", title: t.steps.s2t, body: t.steps.s2b },
    { n: "03", title: t.steps.s3t, body: t.steps.s3b },
    { n: "04", title: t.steps.s4t, body: t.steps.s4b },
  ];

  const faqs = [
    { q: t.faq.q1, a: t.faq.a1 }, { q: t.faq.q2, a: t.faq.a2 },
    { q: t.faq.q3, a: t.faq.a3 }, { q: t.faq.q4, a: t.faq.a4 },
  ];

  const cities = lang === "fa" ? CITIES_FA : CITIES_EN;

  return (
    <>
      {/* ───────── Hero ───────── */}
      <section className="relative mx-auto grid max-w-7xl items-center gap-10 px-5 pb-16 pt-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6 lg:pb-24 lg:pt-10">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.5 }}
            className="glass-thin inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00e5c0] opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#00e5c0]" />
            </span>
            {t.hero.badge}
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ type: "spring", bounce: 0, duration: 0.7, delay: 0.06 }}
            className="mt-5 text-[clamp(2.1rem,5.6vw,4.2rem)] font-extrabold leading-[1.12]">
            {t.hero.title1}
            <br />
            <span className="text-gradient">{t.hero.title2}</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.6, delay: 0.14 }}
            className="muted mt-6 max-w-xl text-[15.5px] leading-[2]">
            {t.hero.sub}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.6, delay: 0.22 }}
            className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/quote"
              className="pressable group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#00e5c0] via-[#33c9ff] to-[#7c5cff] px-6 py-3.5 text-[14.5px] font-extrabold text-[#05060b] shadow-xl shadow-[#7c5cff]/25">
              <span className="relative z-10">{t.hero.cta}</span>
              <span className="absolute inset-0 -translate-x-full bg-white/25 transition-transform duration-500 group-hover:translate-x-full" />
            </Link>
            <Link href="/hubs" className="pressable glass rounded-2xl px-6 py-3.5 text-[14.5px] font-bold">
              {t.hero.cta2}
            </Link>
          </motion.div>

          <p className="muted mt-5 text-[12.5px]">{t.hero.note}</p>
        </div>

        <div className="relative h-[320px] sm:h-[420px] lg:h-[540px]">
          <Hero3D className="absolute inset-0" />
          <div className="pointer-events-none absolute inset-x-6 bottom-2 flex justify-between gap-2">
            {stats && (
              <>
                <MiniStat value={<Counter to={stats.hubs} />} label={t.stats.hubs} />
                <MiniStat value={<Counter to={stats.orders_done} />} label={t.stats.orders} />
                <MiniStat value={<><Counter to={stats.avg_rating} decimals={1} /> ★</>} label={t.stats.rating} />
              </>
            )}
          </div>
        </div>
      </section>

      {/* ───────── City marquee ───────── */}
      <section aria-label={t.a11y.marquee} className="hairline overflow-hidden border-y py-4">
        <div className="marquee gap-10 whitespace-nowrap px-5">
          {[...cities, ...cities].map((c, i) => (
            // the second copy only exists to make the loop seamless, so screen readers skip it
            <span key={i} aria-hidden={i >= cities.length ? true : undefined}
              className="muted flex items-center gap-10 text-[13px] font-semibold tracking-wide">
              {c}
              <span className="h-1 w-1 rounded-full bg-[#00e5c0]" aria-hidden />
            </span>
          ))}
        </div>
      </section>

      {/* ───────── Stat band ───────── */}
      <section className="mx-auto max-w-7xl px-5 py-16 sm:py-20">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[
            { v: stats?.hubs ?? 0, l: t.stats.hubs, s: "+" },
            { v: stats?.cities ?? 0, l: t.stats.cities, s: "" },
            { v: stats?.avg_lead_days ?? 0, l: t.stats.lead, s: "", d: 1 },
            { v: stats?.free_capacity_pct ?? 0, l: t.stats.capacity, s: "٪" },
          ].map((s, i) => (
            <Reveal key={i} delay={i * 0.06}>
              <TiltCard className="glass h-full rounded-3xl p-5 sm:p-6">
                <div className="text-gradient text-[clamp(1.7rem,4vw,2.6rem)] font-extrabold">
                  <Counter to={s.v} decimals={s.d ?? 0} />
                  {lang === "fa" ? (s.s === "+" ? "+" : s.s) : s.s === "٪" ? "%" : s.s}
                </div>
                <div className="muted mt-1 text-[13px] font-semibold">{s.l}</div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── How it works ───────── */}
      <section id="how" className="mx-auto max-w-7xl scroll-mt-28 px-5 py-14">
        <Reveal>
          <h2 className="text-[clamp(1.6rem,3.6vw,2.6rem)] font-extrabold">{t.steps.title}</h2>
          <p className="muted mt-3 text-[15px]">{t.steps.sub}</p>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 0.07}>
              <TiltCard className="glass group h-full rounded-3xl p-6">
                <div className="flex items-center justify-between">
                  <span className="text-gradient text-2xl font-extrabold">{num(s.n, lang)}</span>
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[rgb(var(--line)/0.08)] transition-transform duration-300 group-hover:scale-110">
                    <StepIcon i={i} />
                  </span>
                </div>
                <h3 className="mt-5 text-[16px] font-bold">{s.title}</h3>
                <p className="muted mt-2 text-[13.5px] leading-[1.95]">{s.body}</p>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── Materials ───────── */}
      <section className="mx-auto max-w-7xl px-5 py-14">
        <Reveal>
          <h2 className="text-[clamp(1.6rem,3.6vw,2.6rem)] font-extrabold">
            {lang === "fa" ? "متریال‌ها و فناوری‌ها" : "Materials and technologies"}
          </h2>
          <p className="muted mt-3 text-[15px]">
            {lang === "fa"
              ? "از پی‌ال‌ای اقتصادی تا نایلون تقویت‌شده صنعتی — قیمت هر سانتی‌متر مکعب شفاف است."
              : "From economical PLA to industrial glass-filled nylon — the price per cm³ is always in the open."}
          </p>
        </Reveal>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {materials.map((m, i) => (
            <Reveal key={m.slug} delay={Math.min(i, 6) * 0.05}>
              <TiltCard className="glass group relative h-full overflow-hidden rounded-3xl p-5">
                <span className="absolute -end-8 -top-8 h-24 w-24 rounded-full opacity-25 blur-2xl transition-opacity group-hover:opacity-50"
                  style={{ background: m.color_hex }} />
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: m.color_hex }} />
                  <Pill>{m.technology}</Pill>
                </div>
                <h3 className="mt-4 text-[15.5px] font-bold">{lang === "fa" ? m.name_fa : m.name_en}</h3>
                <p className="muted mt-2 min-h-[54px] text-[12.5px] leading-[1.9]">{lang === "fa" ? m.desc_fa : m.desc_en}</p>
                <div className="hairline mt-3 border-t pt-3 text-[13px] font-bold">
                  {money(m.price_per_cm3, lang)}{" "}
                  <span className="muted font-medium">{t.common.toman} / {t.quote.cm3}</span>
                </div>
              </TiltCard>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── Bento: value props ───────── */}
      <section className="mx-auto max-w-7xl px-5 py-14">
        <div className="grid gap-3 lg:grid-cols-3">
          <Reveal className="lg:col-span-2">
            <div className="glass relative h-full overflow-hidden rounded-[2rem] p-8 sm:p-10">
              <div className="absolute -end-20 -top-20 h-64 w-64 rounded-full bg-[#00e5c0]/25 blur-3xl" />
              <Pill tone="brand">{lang === "fa" ? "مدل درآمدی شفاف" : "Transparent revenue model"}</Pill>
              <h3 className="mt-5 text-[clamp(1.35rem,3vw,2rem)] font-extrabold leading-snug">
                {lang === "fa"
                  ? "درج پرینتر رایگان است. ما فقط ۱۵ درصد از هر سفارش انجام‌شده کارمزد می‌گیریم."
                  : "Listing a printer is free. We take 15% only on completed orders."}
              </h3>
              <p className="muted mt-4 max-w-2xl text-[14px] leading-[2]">
                {lang === "fa"
                  ? "این کارمزد صرف پشتیبانی آنلاین، بررسی و اصلاح فایل، بازاریابی شبکه و درگاه پرداخت امن می‌شود. هیچ هزینه ثبت‌نام یا اشتراک اجباری وجود ندارد."
                  : "That fee funds online support, file checking and repair, network marketing and the secure payment gateway. No signup or mandatory subscription charges."}
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {(lang === "fa"
                  ? ["بدون هزینه ثبت‌نام", "پرداخت ریالی امن", "کنترل کیفیت محلی", "پشتیبانی فارسی"]
                  : ["No signup fee", "Secure Rial payments", "Local quality control", "Persian support"]
                ).map((x) => <Pill key={x}>{x}</Pill>)}
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="glass flex h-full flex-col justify-between rounded-[2rem] p-8">
              <div>
                <Pill tone="ok">{lang === "fa" ? "سرعت" : "Speed"}</Pill>
                <h3 className="mt-5 text-[clamp(1.2rem,2.6vw,1.6rem)] font-extrabold leading-snug">
                  {lang === "fa" ? "نمونه‌سازی از چند هفته به چند روز" : "Prototyping from weeks to days"}
                </h3>
                <p className="muted mt-3 text-[13.5px] leading-[2]">
                  {lang === "fa"
                    ? "چون تولید در همان شهر شما انجام می‌شود، قطعه به‌جای صف واردات و قالب‌سازی، از کارگاه کناری می‌آید."
                    : "Because production happens in your own city, the part comes from a workshop nearby instead of an import queue."}
                </p>
              </div>
              <div className="mt-8">
                <div className="text-gradient text-5xl font-extrabold">
                  <Counter to={stats?.avg_lead_days ?? 3} decimals={1} />
                </div>
                <div className="muted mt-1 text-[13px] font-semibold">{t.stats.lead}</div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section id="faq" className="mx-auto max-w-4xl scroll-mt-28 px-5 py-14">
        <Reveal>
          <h2 className="text-center text-[clamp(1.6rem,3.6vw,2.4rem)] font-extrabold">{t.faq.title}</h2>
        </Reveal>
        <div className="mt-8 space-y-3">
          {faqs.map((f, i) => (
            <Reveal key={i} delay={i * 0.05}>
              <div className="glass overflow-hidden rounded-2xl">
                <h3>
                  <button type="button" id={`faq-q-${i}`} aria-expanded={faq === i} aria-controls={`faq-a-${i}`}
                    onClick={() => setFaq(faq === i ? null : i)}
                    className="flex w-full items-center justify-between gap-4 px-5 py-4 text-start text-[14.5px] font-bold">
                    {f.q}
                    <motion.span aria-hidden animate={{ rotate: faq === i ? 45 : 0 }}
                      transition={{ type: "spring", bounce: 0, duration: 0.3 }}
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[rgb(var(--line)/0.09)] text-lg leading-none">
                      +
                    </motion.span>
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {faq === i && (
                    <motion.div id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`}
                      initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ type: "spring", bounce: 0, duration: 0.38 }}>
                      <p className="muted px-5 pb-5 text-[13.5px] leading-[2.1]">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ───────── Closing CTA ───────── */}
      <section className="mx-auto max-w-7xl px-5 py-14">
        <Reveal>
          <div className="glass relative overflow-hidden rounded-[2.2rem] px-6 py-14 text-center sm:px-14">
            <div className="absolute -start-24 top-0 h-72 w-72 rounded-full bg-[#7c5cff]/30 blur-3xl" />
            <div className="absolute -end-24 bottom-0 h-72 w-72 rounded-full bg-[#00e5c0]/25 blur-3xl" />
            <h2 className="relative text-[clamp(1.5rem,4vw,2.7rem)] font-extrabold leading-tight">{t.cta.title}</h2>
            <p className="muted relative mx-auto mt-4 max-w-xl text-[14.5px] leading-[2]">{t.cta.sub}</p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/login"
                className="pressable rounded-2xl bg-gradient-to-r from-[#00e5c0] to-[#7c5cff] px-7 py-3.5 text-[14.5px] font-extrabold text-[#05060b] shadow-xl shadow-[#7c5cff]/25">
                {t.cta.btn}
              </Link>
              <Link href="/quote" className="pressable glass-thin rounded-2xl px-7 py-3.5 text-[14.5px] font-bold">
                {t.hero.cta}
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </>
  );
}

function MiniStat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="glass rounded-2xl px-3 py-2 text-center">
      <div className="text-[15px] font-extrabold">{value}</div>
      <div className="muted text-[10.5px] font-semibold">{label}</div>
    </div>
  );
}

function StepIcon({ i }: { i: number }) {
  const common = { className: "h-[18px] w-[18px]", "aria-hidden": true, fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (i === 0) return <svg viewBox="0 0 24 24" {...common}><path d="M12 16V4m0 0L8 8m4-4l4 4" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" /></svg>;
  if (i === 1) return <svg viewBox="0 0 24 24" {...common}><path d="M12 2l9 5v10l-9 5-9-5V7z" /><path d="M3 7l9 5 9-5M12 12v10" /></svg>;
  if (i === 2) return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="10" r="3" /><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /></svg>;
  return <svg viewBox="0 0 24 24" {...common}><path d="M20 6L9 17l-5-5" /></svg>;
}
