"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { MotionConfig } from "framer-motion";
import { dict, type Dict, type Lang } from "@/lib/i18n";
import { ApiError, api, post, setToken, token } from "@/lib/api";

type Theme = "light" | "dark";
type User = { id: number; email: string; full_name: string; company?: string | null; phone?: string | null; role: string };

type Ctx = {
  lang: Lang; setLang: (l: Lang) => void; t: Dict; rtl: boolean;
  theme: Theme; toggleTheme: () => void;
  user: User | null; ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (body: Record<string, unknown>) => Promise<void>;
  logout: () => void;
};

type AuthRes = { token: string; user: User };

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside <Providers>");
  return ctx;
};

/** First focusable element on the page; lets keyboard/screen-reader users bypass the header. */
function SkipLink() {
  const { t } = useApp();
  return <a href="#main" className="skip-link">{t.a11y.skip}</a>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fa");
  const [theme, setTheme] = useState<Theme>("dark");
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  // False until stored prefs are read. Gates the DOM/localStorage write effects so the SSR
  // defaults (fa/dark) never overwrite the saved choice or flash the wrong theme on mount.
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const animTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    try {
      const l = localStorage.getItem("h3d_lang");
      const th = localStorage.getItem("h3d_theme");
      if (l === "fa" || l === "en") setLangState(l);
      if (th === "light" || th === "dark") setTheme(th);
      else setTheme(window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    } catch {}
    setPrefsLoaded(true);

    // No token means no session: skip the /me round trip entirely.
    if (!token()) { setReady(true); return; }
    api<User>("/api/auth/me")
      .then(setUser)
      .catch((e) => { if (e instanceof ApiError && e.status === 401) setToken(null); })
      .finally(() => setReady(true));
  }, []);

  // api() fires "h3d:logout" on an expired session; "storage" propagates logout from other tabs.
  useEffect(() => {
    const clear = () => setUser(null);
    const onStorage = (e: StorageEvent) => { if (e.key === "h3d_token" && !e.newValue) clear(); };
    window.addEventListener("h3d:logout", clear);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("h3d:logout", clear);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    document.documentElement.setAttribute("dir", dict[lang].dir);
    document.documentElement.setAttribute("lang", lang);
    try { localStorage.setItem("h3d_lang", lang); } catch {}
  }, [lang, prefsLoaded]);

  useEffect(() => {
    if (!prefsLoaded) return;
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("h3d_theme", theme); } catch {}
  }, [theme, prefsLoaded]);

  useEffect(() => () => {
    clearTimeout(animTimer.current);
    document.documentElement.classList.remove("theme-anim");
  }, []);

  const toggleTheme = useCallback(() => {
    // Only user-initiated toggles ease; the initial theme is applied without animation.
    const el = document.documentElement;
    el.classList.add("theme-anim");
    clearTimeout(animTimer.current);
    animTimer.current = setTimeout(() => el.classList.remove("theme-anim"), 450);
    setTheme((p) => (p === "dark" ? "light" : "dark"));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await post<AuthRes>("/api/auth/login", { email, password });
    setToken(res.token);
    setUser(res.user);
  }, []);

  const signup = useCallback(async (body: Record<string, unknown>) => {
    const res = await post<AuthRes>("/api/auth/register", body);
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<Ctx>(() => ({
    lang, setLang: setLangState, t: dict[lang] as Dict, rtl: lang === "fa",
    theme, toggleTheme,
    user, ready, login, signup, logout,
  }), [lang, theme, toggleTheme, user, ready, login, signup, logout]);

  return (
    <AppCtx.Provider value={value}>
      <MotionConfig reducedMotion="user">
        <SkipLink />
        {children}
      </MotionConfig>
    </AppCtx.Provider>
  );
}
