"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useApp } from "./Providers";

const Logo = () => (
  <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-gradient-to-br from-[#00e5c0] via-[#33c9ff] to-[#7c5cff] shadow-lg shadow-[#00e5c0]/25">
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="#05060b" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2 3 7v10l9 5 9-5V7z" />
      <path d="M3 7l9 5 9-5M12 12v10" />
    </svg>
  </span>
);

export function Header() {
  const { t, lang, setLang, theme, toggleTheme, user, logout } = useApp();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => setOpen(false), [path]);

  const links = [
    { href: "/", label: t.nav.home },
    { href: "/quote", label: t.nav.quote },
    { href: "/hubs", label: t.nav.hubs },
    { href: "/#how", label: t.nav.how },
  ];

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <motion.nav
        initial={false}
        animate={{ paddingTop: scrolled ? 8 : 12, paddingBottom: scrolled ? 8 : 12 }}
        transition={{ type: "spring", bounce: 0, duration: 0.35 }}
        className={`mx-auto flex max-w-7xl items-center gap-2 rounded-2xl px-3 sm:px-4 ${scrolled ? "glass" : "glass-thin"}`}
      >
        <Link href="/" className="pressable flex items-center gap-2.5 font-extrabold">
          <Logo />
          <span className="hidden text-[15px] sm:block">{t.brand}</span>
          <span className="text-[15px] sm:hidden">{t.brandShort}</span>
        </Link>

        <div className="mx-auto hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = l.href === path || (l.href !== "/" && path.startsWith(l.href));
            return (
              <Link key={l.href} href={l.href}
                className={`relative rounded-xl px-3.5 py-2 text-[13.5px] font-semibold transition-colors ${active ? "" : "muted hover:text-[var(--fg)]"}`}>
                {active && (
                  <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-[rgb(var(--line)/0.09)]"
                    transition={{ type: "spring", bounce: 0.18, duration: 0.45 }} />
                )}
                <span className="relative">{l.label}</span>
              </Link>
            );
          })}
        </div>

        <div className="ms-auto flex items-center gap-1.5 md:ms-0">
          <button onClick={() => setLang(lang === "fa" ? "en" : "fa")} aria-label={t.common.lang}
            className="pressable hairline grid h-9 w-11 place-items-center rounded-xl border text-[11.5px] font-bold">
            {lang === "fa" ? "EN" : "فا"}
          </button>

          <button onClick={toggleTheme} aria-label={t.common.theme}
            className="pressable hairline grid h-9 w-9 place-items-center rounded-xl border">
            <AnimatePresence mode="wait" initial={false}>
              <motion.span key={theme}
                initial={{ opacity: 0, rotate: -50, scale: 0.7 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 50, scale: 0.7 }}
                transition={{ type: "spring", bounce: 0, duration: 0.3 }}>
                {theme === "dark" ? (
                  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
                  </svg>
                )}
              </motion.span>
            </AnimatePresence>
          </button>

          {user ? (
            <div className="hidden items-center gap-1.5 sm:flex">
              <Link href="/dashboard" className="pressable rounded-xl bg-[rgb(var(--line)/0.09)] px-3.5 py-2 text-[13px] font-bold">
                {t.nav.dashboard}
              </Link>
              <button onClick={logout} className="pressable muted rounded-xl px-2.5 py-2 text-[13px] font-semibold hover:text-[var(--fg)]">
                {t.nav.logout}
              </button>
            </div>
          ) : (
            <Link href="/login"
              className="pressable hidden rounded-xl bg-gradient-to-r from-[#00e5c0] to-[#7c5cff] px-4 py-2 text-[13px] font-bold text-[#05060b] shadow-lg shadow-[#7c5cff]/20 sm:block">
              {t.nav.login}
            </Link>
          )}

          <button onClick={() => setOpen((o) => !o)} aria-label="menu"
            className="pressable hairline grid h-9 w-9 place-items-center rounded-xl border md:hidden">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </motion.nav>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -12, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -12, filter: "blur(8px)" }}
            transition={{ type: "spring", bounce: 0, duration: 0.32 }}
            className="glass mx-auto mt-2 max-w-7xl overflow-hidden rounded-2xl p-2 md:hidden">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="block rounded-xl px-4 py-3 text-sm font-semibold hover:bg-[rgb(var(--line)/0.07)]">
                {l.label}
              </Link>
            ))}
            <div className="hairline mt-1 border-t pt-2">
              {user ? (
                <>
                  <Link href="/dashboard" className="block rounded-xl px-4 py-3 text-sm font-semibold hover:bg-[rgb(var(--line)/0.07)]">{t.nav.dashboard}</Link>
                  <button onClick={logout} className="block w-full rounded-xl px-4 py-3 text-start text-sm font-semibold hover:bg-[rgb(var(--line)/0.07)]">{t.nav.logout}</button>
                </>
              ) : (
                <Link href="/login" className="block rounded-xl px-4 py-3 text-sm font-bold text-[#00b596] dark:text-[#4ff3d6]">{t.nav.login}</Link>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
