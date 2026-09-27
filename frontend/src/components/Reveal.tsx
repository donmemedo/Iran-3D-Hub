"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/** Scroll reveal. Critically damped by default — no bounce on a plain entrance. */
export function Reveal({
  children, delay = 0, y = 26, className = "",
}: { children: ReactNode; delay?: number; y?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y, filter: "blur(6px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ type: "spring", bounce: 0, duration: 0.6, delay }}
    >
      {children}
    </motion.div>
  );
}
