"use client";

import Link from "next/link";
import { useApp } from "./Providers";

export function Footer() {
  const { t } = useApp();
  const year = new Date().getFullYear();
  return (
    <footer className="hairline mt-24 border-t px-5 pb-10 pt-12">
      <div className="mx-auto grid max-w-7xl gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="text-lg font-extrabold">{t.brand}</div>
          <p className="muted mt-3 max-w-xs text-[13.5px] leading-relaxed">{t.footer.built}</p>
        </div>
        <div>
          <div className="mb-3 text-[13px] font-bold">{t.footer.product}</div>
          <ul className="muted space-y-2 text-[13.5px]">
            <li><Link href="/quote" className="hover:text-[var(--fg)]">{t.nav.quote}</Link></li>
            <li><Link href="/hubs" className="hover:text-[var(--fg)]">{t.nav.hubs}</Link></li>
            <li><Link href="/dashboard" className="hover:text-[var(--fg)]">{t.nav.dashboard}</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-[13px] font-bold">{t.footer.company}</div>
          <ul className="muted space-y-2 text-[13.5px]">
            <li><Link href="/#how" className="hover:text-[var(--fg)]">{t.footer.about}</Link></li>
            <li><Link href="/#faq" className="hover:text-[var(--fg)]">{t.footer.contact}</Link></li>
            <li><Link href="/hubs" className="hover:text-[var(--fg)]">{t.footer.careers}</Link></li>
          </ul>
        </div>
        <div>
          <div className="mb-3 text-[13px] font-bold">{t.footer.legal}</div>
          <ul className="muted space-y-2 text-[13.5px]">
            <li><span>{t.footer.privacy}</span></li>
            <li><span>{t.footer.terms}</span></li>
          </ul>
        </div>
      </div>
      <div className="muted hairline mx-auto mt-10 max-w-7xl border-t pt-6 text-center text-[12.5px]">
        © {year} {t.brand} — {t.footer.rights}
      </div>
    </footer>
  );
}
