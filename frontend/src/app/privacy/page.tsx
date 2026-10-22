"use client";

import Link from "next/link";
import { useApp } from "@/components/Providers";

type Section = { h: string; p?: string; items?: string[] };

// Working draft: the wording below must be reviewed by legal counsel before launch.
const CONTENT: Record<"fa" | "en", { title: string; intro: string; sections: Section[]; contact: string; contactLink: string }> = {
  fa: {
    title: "حریم خصوصی",
    intro: "اینجا ساده توضیح می‌دهیم چه اطلاعاتی از شما نگه می‌داریم، برای چه و تا کی.",
    sections: [
      {
        h: "چه اطلاعاتی گردآوری می‌کنیم",
        items: [
          "ایمیل، نام و نام خانوادگی، شماره موبایل و نام سازمان (اختیاری) هنگام ساخت حساب کاربری.",
          "نشانی تحویل و توضیحی که برای تولیدکننده می‌نویسید.",
          "اطلاعات سفارش‌ها و برآوردهای قیمت، مثل متریال، تعداد، حجم و ابعاد قطعه.",
          "فایل مدل سه‌بعدی فقط برای محاسبه قیمت در حافظه بررسی می‌شود و روی سرور ذخیره نمی‌شود.",
        ],
      },
      {
        h: "چرا گردآوری می‌کنیم",
        p: "برای ساخت حساب کاربری، محاسبه قیمت، سپردن سفارش به تولیدکننده، تحویل قطعه و پاسخ به پشتیبانی. از اطلاعات شما برای کار دیگری استفاده نمی‌کنیم.",
      },
      {
        h: "تا کی نگه می‌داریم",
        p: "اطلاعات تا زمانی که حساب کاربری شما وجود دارد نگه داشته می‌شود. هر وقت بخواهید، می‌توانید حذف حساب و اطلاعاتتان را درخواست کنید.",
      },
      {
        h: "ردیاب و سرویس‌های بیرونی",
        p: "در این سایت هیچ ردیاب شخص ثالثی وجود ندارد و فونت‌ها از سرور خودمان بارگیری می‌شوند، نه از سرویس‌های بیرونی.",
      },
      {
        h: "آنچه در مرورگر شما می‌ماند",
        p: "نشانه ورود شما تا زمان خروج در حافظه محلی مرورگر (localStorage) نگه داشته می‌شود. زبان و پوسته‌ای که انتخاب کرده‌اید هم همان‌جا ذخیره می‌شود. با زدن «خروج»، نشانه ورود پاک می‌شود.",
      },
    ],
    contact: "برای هر پرسش یا درخواست حذف اطلاعات، از طریق همین سایت با ما تماس بگیرید:",
    contactLink: "تماس",
  },
  en: {
    title: "Privacy",
    intro: "A plain-language summary of what we keep about you, why, and for how long.",
    sections: [
      {
        h: "What we collect",
        items: [
          "Email, full name, mobile number and company name (optional) when you create an account.",
          "The delivery address and the note you write for the producer.",
          "Order and quote data, such as material, quantity, volume and dimensions of the part.",
          "Your 3D model file is analysed in memory only to calculate the price and is not stored on our servers.",
        ],
      },
      {
        h: "Why we collect it",
        p: "To run your account, calculate prices, hand your order to a producer, deliver the part and answer support requests. We do not use your data for anything else.",
      },
      {
        h: "How long we keep it",
        p: "Your data is kept while your account exists. You can ask us to delete your account and data at any time.",
      },
      {
        h: "Trackers and third parties",
        p: "There are no third-party trackers, and fonts are served from our own server rather than an external service.",
      },
      {
        h: "What stays in your browser",
        p: "Your sign-in token is kept in the browser's local storage (localStorage) until you log out. The language and theme you choose are stored there too. Logging out removes the token.",
      },
    ],
    contact: "For any question or a deletion request, contact us through this site:",
    contactLink: "Contact",
  },
};

export default function PrivacyPage() {
  const { lang } = useApp();
  const c = CONTENT[lang];

  return (
    <article className="mx-auto max-w-3xl px-5 pb-20">
      <header className="py-8">
        <h1 className="text-[clamp(1.8rem,4.4vw,3rem)] font-extrabold">{c.title}</h1>
        <p className="muted mt-3 text-[15px] leading-[2]">{c.intro}</p>
      </header>

      <DraftNotice />

      <div className="mt-6 space-y-4">
        {c.sections.map((s) => (
          <section key={s.h} className="glass rounded-3xl p-6">
            <h2 className="text-[17px] font-extrabold">{s.h}</h2>
            {s.p && <p className="muted mt-3 text-[14px] leading-[2]">{s.p}</p>}
            {s.items && (
              <ul className="muted mt-3 list-disc space-y-1.5 ps-5 text-[14px] leading-[2]">
                {s.items.map((x) => <li key={x}>{x}</li>)}
              </ul>
            )}
          </section>
        ))}
      </div>

      <p className="muted mt-8 text-[14px] leading-[2]">
        {c.contact}{" "}
        <Link href="/#faq" className="font-bold text-[var(--fg)] underline">{c.contactLink}</Link>
      </p>
    </article>
  );
}

/** Always shown in both languages, whatever the interface language is. */
function DraftNotice() {
  return (
    <div role="note" className="rounded-2xl bg-amber-500/12 p-4 text-[13px] font-semibold leading-[1.9] ring-1 ring-amber-500/40">
      <p lang="fa" dir="rtl">این متن یک پیش‌نویس کاری است و هنوز توسط کارشناس حقوقی بازبینی نشده است.</p>
      <p lang="en" dir="ltr" className="mt-1">This text is a working draft and has not yet been reviewed by legal counsel.</p>
    </div>
  );
}
