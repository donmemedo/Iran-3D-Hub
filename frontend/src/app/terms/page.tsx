"use client";

import Link from "next/link";
import { useApp } from "@/components/Providers";

type Section = { h: string; p: string };

// Working draft: the wording below must be reviewed by legal counsel before launch.
const CONTENT: Record<"fa" | "en", { title: string; intro: string; sections: Section[]; privacy: string }> = {
  fa: {
    title: "شرایط استفاده",
    intro: "با استفاده از هاب سه‌بعدی ایران، این شرایط را می‌پذیرید. خلاصه‌اش این است.",
    sections: [
      {
        h: "خدمت ما",
        p: "هاب سه‌بعدی ایران فایل یا حجم قطعه شما را بررسی می‌کند، قیمت و زمان تحویل را نشان می‌دهد و سفارش را به تولیدکننده‌ای از شبکه می‌سپارد.",
      },
      {
        h: "قیمت‌ها برآورد هستند",
        p: "مبلغ نمایش‌داده‌شده یک برآورد است و ۲۴ ساعت اعتبار دارد. پس از آن باید دوباره قیمت بگیرید. برای قالب‌هایی که دقیق اندازه‌گیری نمی‌شوند، کارشناس ما برآورد را بازبینی می‌کند و ممکن است تغییر کند.",
      },
      {
        h: "کارمزد پلتفرم",
        p: "کارمزد ۱۵ درصدی پلتفرم همیشه جدا از قیمت قطعه‌ها نمایش داده می‌شود و در مبلغ قابل پرداخت آمده است.",
      },
      {
        h: "مسئولیت تولیدکننده",
        p: "کیفیت ساخت و مطابقت قطعه با سفارش بر عهده تولیدکننده است. قطعه پیش از ارسال بازرسی می‌شود.",
      },
      {
        h: "لغو سفارش",
        p: "تا پیش از ارسال می‌توانید سفارش را از پیش‌خوان لغو کنید. پس از ارسال، سفارش دیگر قابل لغو نیست.",
      },
      {
        h: "محدودیت مسئولیت",
        p: "[جای‌نگهدار] متن این بند پس از بازبینی حقوقی تکمیل می‌شود.",
      },
    ],
    privacy: "درباره اطلاعات شما بخوانید:",
  },
  en: {
    title: "Terms of service",
    intro: "By using 3D Hub Iran you accept these terms. Here is the short version.",
    sections: [
      {
        h: "What we do",
        p: "3D Hub Iran reads your file or part volume, shows a price and lead time, and hands the order to a producer in the network.",
      },
      {
        h: "Prices are estimates",
        p: "The amount shown is an estimate and is valid for 24 hours. After that you need to request a new quote. For formats we cannot measure exactly, an engineer reviews the estimate and it may change.",
      },
      {
        h: "Platform fee",
        p: "The 15% platform fee is always shown separately from the parts price and is included in the amount payable.",
      },
      {
        h: "Producer responsibility",
        p: "The producer is responsible for build quality and for the part matching the order. Parts are inspected before dispatch.",
      },
      {
        h: "Cancellation",
        p: "You can cancel an order from your dashboard until it ships. Once it has shipped it can no longer be canceled.",
      },
      {
        h: "Limitation of liability",
        p: "[Placeholder] This clause will be completed after legal review.",
      },
    ],
    privacy: "Read how we handle your data:",
  },
};

export default function TermsPage() {
  const { lang, t } = useApp();
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
            <p className="muted mt-3 text-[14px] leading-[2]">{s.p}</p>
          </section>
        ))}
      </div>

      <p className="muted mt-8 text-[14px] leading-[2]">
        {c.privacy}{" "}
        <Link href="/privacy" className="font-bold text-[var(--fg)] underline">{t.footer.privacy}</Link>
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
