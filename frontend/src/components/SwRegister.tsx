"use client";

import { useEffect } from "react";

/** Registers /sw.js in production only. In dev it removes any leftover worker so stale caches never mask edits. */
export function SwRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      navigator.serviceWorker.getRegistrations()
        .then((rs) => rs.forEach((r) => r.unregister()))
        .catch(() => {});
      return;
    }
    const register = () =>
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {});
    if (document.readyState === "complete") { register(); return; }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
