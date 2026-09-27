from sqlmodel import Session, select

from .db import engine
from .models import Hub, Material, Review, User
from .security import hash_password

MATERIALS = [
    ("pla", "پی‌ال‌ای", "PLA", "FDM", 1.24, 11_000, "#34D399", 0.8,
     "اقتصادی، دقیق و مناسب نمونه‌سازی سریع و ماکت معماری.",
     "Economical and accurate — ideal for rapid prototyping and architectural models."),
    ("petg", "پی‌ای‌تی‌جی", "PETG", "FDM", 1.27, 14_000, "#22D3EE", 0.9,
     "مقاوم در برابر ضربه و رطوبت؛ مناسب قطعات کاربردی.",
     "Impact and moisture resistant — a solid pick for functional parts."),
    ("abs", "ای‌بی‌اس", "ABS", "FDM", 1.04, 13_000, "#A78BFA", 1.0,
     "تحمل دمایی بالاتر و قابلیت پرداخت با بخار استون.",
     "Higher heat tolerance and acetone-smoothable finish."),
    ("tpu", "تی‌پی‌یو انعطاف‌پذیر", "TPU Flexible", "FDM", 1.21, 26_000, "#FB7185", 1.2,
     "لاستیکی و انعطاف‌پذیر برای واشر، بند و قطعات ضربه‌گیر.",
     "Rubber-like and flexible: gaskets, straps and shock absorbers."),
    ("resin-std", "رزین استاندارد", "Standard Resin", "SLA", 1.10, 38_000, "#F472B6", 0.4,
     "جزئیات بسیار بالا برای مینیاتور، جواهر و ماکت دندان.",
     "Very high detail for miniatures, jewellery and dental models."),
    ("resin-tough", "رزین مهندسی", "Tough Resin", "SLA", 1.15, 52_000, "#FBBF24", 0.6,
     "سطح صاف با استحکام نزدیک به ای‌بی‌اس برای قطعات مونتاژی.",
     "Smooth surface with ABS-like strength for assembly parts."),
    ("pa12", "نایلون پی‌ای ۱۲", "Nylon PA12", "SLS", 1.01, 61_000, "#60A5FA", 0.7,
     "بدون نیاز به ساپورت، مناسب تولید کم‌تیراژ و قطعات صنعتی.",
     "Support-free — built for low-volume production and industrial parts."),
    ("pa12-gf", "نایلون تقویت‌شده", "Nylon GF", "SLS", 1.30, 78_000, "#818CF8", 0.9,
     "الیاف شیشه برای سفتی و پایداری ابعادی بیشتر.",
     "Glass-filled for extra stiffness and dimensional stability."),
]

HUBS = [
    ("کارگاه پرینت آرمان", "Arman Print Lab", "تهران", "Tehran", 35.7219, 51.3347,
     "FDM,SLA", "pla,petg,abs,tpu,resin-std", 4.9, 214, 1180, 2, 300, 62, 52_000, True,
     "کارگاه تخصصی نمونه‌سازی صنعتی با ۹ دستگاه فعال و کنترل کیفیت سه‌مرحله‌ای.",
     "Industrial prototyping workshop, 9 active machines and a 3-stage QC pass."),
    ("مرکز ساخت افزایشی شریف", "Sharif Additive Center", "تهران", "Tehran", 35.7025, 51.3519,
     "FDM,SLS", "pla,petg,pa12,pa12-gf", 4.8, 168, 902, 3, 350, 48, 68_000, True,
     "وابسته به شتاب‌دهنده دانشگاهی؛ تخصص در قطعات مهندسی و تیراژ پایین.",
     "University-accelerator hub specialised in engineering parts and short runs."),
    ("استودیو رزین نارمک", "Narmak Resin Studio", "تهران", "Tehran", 35.7445, 51.5030,
     "SLA", "resin-std,resin-tough", 4.7, 96, 511, 2, 190, 71, 74_000, False,
     "تمرکز روی جزئیات بالا: جواهر، مینیاتور و ماکت دندان‌پزشکی.",
     "High-detail focus: jewellery, miniatures and dental models."),
    ("هاب صنعتی البرز", "Alborz Industrial Hub", "کرج", "Karaj", 35.8355, 50.9915,
     "FDM,SLS", "pla,abs,petg,pa12", 4.6, 73, 388, 3, 400, 35, 49_000, False,
     "ظرفیت بالا برای قطعات بزرگ و سفارش‌های تکرارشونده کارخانه‌ای.",
     "High capacity for large parts and repeat factory orders."),
    ("مکرلب اصفهان", "MakerLab Isfahan", "اصفهان", "Isfahan", 32.6539, 51.6660,
     "FDM,SLA", "pla,petg,tpu,resin-std", 4.8, 131, 654, 3, 260, 54, 44_000, True,
     "شبکه‌ای از هفت میکر محلی با تحویل درون‌شهری زیر ۲۴ ساعت.",
     "A network of seven local makers with sub-24h in-city delivery."),
    ("پرینت سه‌بعدی رضوی", "Razavi 3D Print", "مشهد", "Mashhad", 36.2974, 59.6062,
     "FDM", "pla,abs,petg", 4.5, 58, 297, 4, 220, 40, 38_000, False,
     "گزینه اقتصادی شمال‌شرق کشور برای نمونه‌سازی و آموزش.",
     "The economical north-east option for prototyping and education."),
    ("کارگاه فناوری شیراز", "Shiraz Tech Works", "شیراز", "Shiraz", 29.5918, 52.5837,
     "FDM,SLA", "pla,petg,resin-std,resin-tough", 4.7, 89, 431, 3, 280, 58, 46_000, True,
     "همکاری با شرکت‌های پزشکی و دندان‌پزشکی منطقه.",
     "Partnered with regional medical and dental companies."),
    ("آذر ادیتیو", "Azar Additive", "تبریز", "Tabriz", 38.0800, 46.2919,
     "FDM,SLS", "pla,abs,pa12,pa12-gf", 4.6, 64, 352, 4, 320, 44, 51_000, False,
     "تخصص در قطعات یدکی خودرو و ماشین‌آلات صنعتی.",
     "Specialists in automotive and industrial machine spare parts."),
]

REVIEWS = [
    (1, "مهندس ک. رستمی", 5, "فایل را ساعت ۱۰ شب فرستادم، ظهر روز بعد قطعه تحویل داده شد. کیفیت سطح عالی بود."),
    (1, "شرکت پویا صنعت", 5, "برای ۴۰ قطعه تیراژ پایین، از قالب‌سازی هم ارزان‌تر و خیلی سریع‌تر درآمد."),
    (2, "دکتر ص. موسوی", 5, "دقت ابعادی روی قطعه نایلونی دقیقا مطابق نقشه بود."),
    (3, "استودیو طراحی مانا", 4, "جزئیات رزین بی‌نظیر است؛ فقط بسته‌بندی می‌تواند بهتر باشد."),
    (5, "م. کاظمی", 5, "پشتیبانی فارسی و اصلاح رایگان فایل واقعا کار را راه انداخت."),
]


def seed() -> None:
    with Session(engine) as s:
        if not s.exec(select(Material)).first():
            for (slug, fa, en, tech, dens, price, color, wall, dfa, den) in MATERIALS:
                s.add(Material(slug=slug, name_fa=fa, name_en=en, technology=tech,
                               density=dens, price_per_cm3=price, color_hex=color,
                               min_wall_mm=wall, desc_fa=dfa, desc_en=den))
        if not s.exec(select(Hub)).first():
            for h in HUBS:
                s.add(Hub(name_fa=h[0], name_en=h[1], city_fa=h[2], city_en=h[3],
                          lat=h[4], lng=h[5], technologies=h[6], materials=h[7],
                          rating=h[8], reviews_count=h[9], orders_done=h[10],
                          lead_time_days=h[11], max_build_mm=h[12], capacity_pct=h[13],
                          hourly_rate=h[14], pro=h[15], bio_fa=h[16], bio_en=h[17]))
            s.commit()
            for (hub_id, author, rating, body) in REVIEWS:
                s.add(Review(hub_id=hub_id, author=author, rating=rating, body=body))
        if not s.exec(select(User).where(User.email == "demo@3dhub.ir")).first():
            s.add(User(email="demo@3dhub.ir", full_name="کاربر نمونه", company="دارواگ",
                       phone="09120000000", password_hash=hash_password("demo1234")))
        s.commit()
