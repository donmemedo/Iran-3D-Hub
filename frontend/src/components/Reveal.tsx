"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Scroll reveal. Critically damped by default — no bounce on a plain entrance.
 * Reduced motion gets a short opacity cross-fade only: no travel, no blur, no stagger delay.
 */
export function Reveal({
  children, delay = 0, y = 26, className = "",
}: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y, filter: "blur(6px)" }}
      whileInView={
        reduce
          ? { opacity: 1 }
          // transitionEnd drops the filter once settled: even blur(0px) would make this wrapper a
          // backdrop root and stop .glass children from blurring the aurora behind them.
          : { opacity: 1, y: 0, filter: "blur(0px)", transitionEnd: { filter: "none" } }
      }
      viewport={{ once: true, margin: "-70px" }}
      transition={reduce ? { duration: 0.18, ease: "easeOut" } : { type: "spring", bounce: 0, duration: 0.6, delay }}
    >
      {children}
    </motion.div>
  );
}
