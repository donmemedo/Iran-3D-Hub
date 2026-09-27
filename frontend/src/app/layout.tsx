import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "هاب سه‌بعدی ایران | 3D Hub Iran",
  description:
    "بازارگاه آنلاین سفارش چاپ سه‌بعدی و ساخت افزایشی در ایران — قیمت آنی، شبکه تولیدکننده‌های تاییدشده و تحویل شهری.",
  manifest: "/manifest.webmanifest",
  applicationName: "3D Hub Iran",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "3D Hub" },
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  openGraph: {
    title: "هاب سه‌بعدی ایران | 3D Hub Iran",
    description: "فایل را بارگذاری کنید، قیمت آنی بگیرید و قطعه را در چند روز تحویل بگیرید.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f9" },
    { media: "(prefers-color-scheme: dark)", color: "#05060b" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Applied before paint so the first frame is already the right theme. */
const noFlash = `(function(){try{var t=localStorage.getItem('h3d_theme');var l=localStorage.getItem('h3d_lang')||'fa';if(!t)t=window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';var d=document.documentElement;d.setAttribute('data-theme',t);d.setAttribute('lang',l);d.setAttribute('dir',l==='fa'?'rtl':'ltr')}catch(e){}})()`;

const swRegister = `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){})})}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" data-theme="dark" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
        <div className="aurora" />
        <div className="grid-field" />
        <Providers>
          <Header />
          <main className="pt-24">{children}</main>
          <Footer />
        </Providers>
        <script dangerouslySetInnerHTML={{ __html: swRegister }} />
      </body>
    </html>
  );
}
