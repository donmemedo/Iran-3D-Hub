"use client";

import { motion, useInView, useReducedMotion, useSpring } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { num } from "@/lib/format";
import { useApp } from "./Providers";

export function Counter({ to, decimals = 0, suffix = "" }: { to: number; decimals?: number; suffix?: string }) {
  const { lang } = useApp();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const [value, setValue] = useState(0);
  const end = Number.isFinite(to) ? to : 0; // NaN/Infinity from a missing stat must never reach the screen

  useEffect(() => {
    if (!inView) return;
    if (reduce) { setValue(end); return; }
    let raf = 0;
    const start = performance.now();
    const dur = 1100;
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      setValue(end * (1 - Math.pow(1 - p, 3)));      // ease-out, settles softly
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, end, reduce]);

  const shown = decimals ? value.toFixed(decimals) : Math.round(value).toLocaleString("en-US");
  return <span ref={ref}>{num(shown, lang)}{suffix}</span>;
}

export function Pill({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "brand" | "warn" | "ok" }) {
  // Light-theme text steps are chosen for >= 4.5:1 on their own tinted background.
  const tones = {
    default: "bg-[rgb(var(--line)/0.07)] text-[var(--fg-muted)]",
    brand: "bg-[#00e5c0]/12 text-[#007a66] dark:text-[#4ff3d6]",
    warn: "bg-amber-500/14 text-amber-800 dark:text-amber-300",
    ok: "bg-emerald-500/14 text-emerald-800 dark:text-emerald-300",
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

// useSpring takes `duration` in milliseconds (unlike transition props); `visualDuration` is in seconds.
const TILT_SPRING = { visualDuration: 0.45, bounce: 0 } as const;

/**
 * Card that tips toward the pointer — 1:1 tracking, springs back on leave.
 * The pointer sample lives in a ref and is applied at most once per frame; the tilt itself
 * is a spring-driven motion value, so a pointermove never triggers a React render.
 */
export function TiltCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const raf = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const rotateX = useSpring(0, TILT_SPRING);
  const rotateY = useSpring(0, TILT_SPRING);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const apply = () => {
    raf.current = 0;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    rotateX.set(((pointer.current.y - r.top) / r.height - 0.5) * -8);
    rotateY.set(((pointer.current.x - r.left) / r.width - 0.5) * 8);
  };

  const move = (e: React.PointerEvent) => {
    if (reduce || e.pointerType === "touch") return; // tilt is a hover affordance; a scrolling finger isn't one
    pointer.current.x = e.clientX;
    pointer.current.y = e.clientY;
    if (!raf.current) raf.current = requestAnimationFrame(apply);
  };

  const leave = () => {
    cancelAnimationFrame(raf.current);
    raf.current = 0;
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={move}
      onPointerLeave={leave}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
