"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { dict, type Dict, type Lang } from "@/lib/i18n";
import { api, post } from "@/lib/api";

type Theme = "light" | "dark";
type User = { id: number; email: string; full_name: string; company?: string | null };

type Ctx = {
  lang: Lang; setLang: (l: Lang) => void; t: Dict; rtl: boolean;
  theme: Theme; toggleTheme: () => void;
  user: User | null; ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (body: Record<string, unknown>) => Promise<void>;
  logout: () => void;
};

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside <Providers>");
  return ctx;
};

export function Providers({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("fa");
  const [theme, setTheme] = useState<Theme>("dark");
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const l = localStorage.getItem("h3d_lang") as Lang | null;
      const th = localStorage.getItem("h3d_theme") as Theme | null;
      if (l) setLangState(l);
      if (th) setTheme(th);
      else setTheme(window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    } catch {}
    api<User>("/api/auth/me").then(setUser).catch(() => {}).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const d = dict[lang].dir;
    document.documentElement.setAttribute("dir", d);
    document.documentElement.setAttribute("lang", lang);
    try { localStorage.setItem("h3d_lang", lang); } catch {}
  }, [lang]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("h3d_theme", theme); } catch {}
  }, [theme]);

  const login = useCallback(async (email: string, password: string) => {
    const res: any = await post("/api/auth/login", { email, password });
    localStorage.setItem("h3d_token", res.token);
    setUser(res.user);
  }, []);

  const signup = useCallback(async (body: Record<string, unknown>) => {
    const res: any = await post("/api/auth/register", body);
    localStorage.setItem("h3d_token", res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    try { localStorage.removeItem("h3d_token"); } catch {}
    setUser(null);
  }, []);

  const value = useMemo<Ctx>(() => ({
    lang, setLang: setLangState, t: dict[lang] as Dict, rtl: lang === "fa",
    theme, toggleTheme: () => setTheme((p) => (p === "dark" ? "light" : "dark")),
    user, ready, login, signup, logout,
  }), [lang, theme, user, ready, login, signup, logout]);

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
