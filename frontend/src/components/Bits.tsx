"use client";

import { motion, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { num } from "@/lib/format";
import { useApp } from "./Providers";

export function Counter({ to, decimals = 0, suffix = "" }: { to: number; decimals?: number; suffix?: string }) {
  const { lang } = useApp();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) return setValue(to);
    let raf = 0;
    const start = performance.now();
    const dur = 1100;
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      setValue(to * (1 - Math.pow(1 - p, 3)));      // ease-out, settles softly
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, reduce]);

  const shown = decimals ? value.toFixed(decimals) : Math.round(value).toLocaleString("en-US");
  return <span ref={ref}>{num(shown, lang)}{suffix}</span>;
}

export function Pill({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "brand" | "warn" | "ok" }) {
  const tones = {
    default: "bg-[rgb(var(--line)/0.07)] text-[var(--fg-muted)]",
    brand: "bg-[#00e5c0]/12 text-[#00b596] dark:text-[#4ff3d6]",
    warn: "bg-amber-500/14 text-amber-700 dark:text-amber-300",
    ok: "bg-emerald-500/14 text-emerald-700 dark:text-emerald-300",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

/** Card that tips toward the pointer — 1:1 tracking, springs back on leave. */
export function TiltCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const move = (e: React.PointerEvent) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setTilt({
      x: ((e.clientY - r.top) / r.height - 0.5) * -8,
      y: ((e.clientX - r.left) / r.width - 0.5) * 8,
    });
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={move}
      onPointerLeave={() => setTilt({ x: 0, y: 0 })}
      animate={{ rotateX: tilt.x, rotateY: tilt.y }}
      transition={{ type: "spring", bounce: 0, duration: 0.45 }}
      style={{ transformPerspective: 900 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
