"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "@/components/Providers";
import { StlViewer } from "@/components/StlViewer";
import { Pill } from "@/components/Bits";
import { api, post, upload } from "@/lib/api";
import { money, num } from "@/lib/format";

type Material = { slug: string; name_fa: string; name_en: string; technology: string; price_per_cm3: number; color_hex: string };
type City = { code: string; name_fa: string; name_en: string };
type Tech = { code: string; name_fa: string; name_en: string; desc_fa: string; desc_en: string };
type Hub = { id: number; name_fa: string; name_en: string; city_fa: string; city_en: string; rating: number; lead_time_days: number; capacity_pct: number };
type Match = { hub: Hub; score: number; local: boolean };
type Result = {
  quote: { public_id: string; volume_cm3: number; bbox_x: number; bbox_y: number; bbox_z: number; triangles: number };
  mesh: { volume_cm3: number; bbox: number[]; triangles: number; exact: boolean };
  pricing: { unit_price: number; subtotal: number; platform_fee: number; total_price: number; print_hours: number; lead_time_days: number };
  warnings: string[];
  matches: Match[];
};

export default function QuotePage() {
  const { t, lang, user } = useApp();
  const router = useRouter();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);

  const [tech, setTech] = useState("FDM");
  const [material, setMaterial] = useState("pla");
  const [quality, setQuality] = useState<"draft" | "standard" | "fine">("standard");
  const [infill, setInfill] = useState(20);
  const [quantity, setQuantity] = useState(1);
  const [city, setCity] = useState("tehran");

  const [file, setFile] = useState<File | null>(null);
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null);
  const [manualVol, setManualVol] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [mesh, setMesh] = useState<Result["mesh"] | null>(null);

  const [hub, setHub] = useState<number | null>(null);
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [placing, setPlacing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api<Material[]>("/api/materials").then(setMaterials).catch(() => {});
    api<City[]>("/api/cities").then(setCities).catch(() => {});
    api<Tech[]>("/api/technologies").then(setTechs).catch(() => {});
  }, []);

  const shown = materials.filter((m) => m.technology === tech);
  useEffect(() => {
    if (shown.length && !shown.some((m) => m.slug === material)) setMaterial(shown[0].slug);
  }, [tech, materials]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async () => {
    setError("");
    setBusy(true);
    try {
      let res: Result;
      if (file && !mesh) {
        const form = new FormData();
        form.append("file", file);
        form.append("material_slug", material);
        form.append("quality", quality);
        form.append("infill", String(infill));
        form.append("quantity", String(quantity));
        form.append("city", city);
        res = await upload("/api/quotes/analyze", form) as Result;
        setMesh(res.mesh);
      } else {
        // The mesh is already measured (or typed in), so re-price from the
        // known volume instead of re-uploading the file on every knob turn.
        const v = mesh ? mesh.volume_cm3 : parseFloat(manualVol);
        if (!v || v <= 0) { setBusy(false); return; }
        res = await post("/api/quotes/manual", {
          volume_cm3: v, bbox: mesh?.bbox ?? [60, 60, 60],
          material_slug: material, quality, infill, quantity, city,
          filename: file ? file.name : lang === "fa" ? "ورودی دستی" : "manual entry",
        }) as Result;
        if (mesh) res = { ...res, mesh, warnings: res.warnings };
      }
      setResult(res);
      setHub(res.matches[0]?.hub.id ?? null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy(false);
    }
  }, [file, mesh, manualVol, material, quality, infill, quantity, city, lang]);

  // Re-quote whenever a knob changes — feedback is continuous, not on submit.
  useEffect(() => {
    if (!file && !manualVol) return;
    const id = setTimeout(run, 260);
    return () => clearTimeout(id);
  }, [material, quality, infill, quantity, city, file, manualVol]); // eslint-disable-line react-hooks/exhaustive-deps

  const accept = (f: File) => {
    setFile(f);
    setResult(null);
    setMesh(null);   // a new file must be measured again
    f.arrayBuffer().then((b) => setBuffer(f.name.toLowerCase().endsWith(".stl") ? b : null));
  };

  const placeOrder = async () => {
    if (!result) return;
    if (!user) { router.push("/login?next=/quote"); return; }
    if (!address.trim()) { setError(t.quote.empty); return; }
    setPlacing(true);
    setError("");
    try {
      await post("/api/orders", {
        quote_public_id: result.quote.public_id, hub_id: hub, address, note,
      });
      router.push("/dashboard");
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setPlacing(false);
    }
  };

  const bbox = result?.mesh.bbox ?? [0, 0, 0];

  return (
    <div className="mx-auto max-w-7xl px-5 pb-20">
      <header className="py-8">
        <h1 className="text-[clamp(1.8rem,4.4vw,3rem)] font-extrabold">{t.quote.title}</h1>
        <p className="muted mt-3 text-[15px]">{t.quote.sub}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        {/* ── Left: upload + configuration ── */}
        <div className="space-y-4">
          <motion.div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) accept(f); }}
            onClick={() => inputRef.current?.click()}
            animate={{ scale: dragging ? 1.015 : 1 }}
            transition={{ type: "spring", bounce: 0.25, duration: 0.4 }}
            className={`glass relative cursor-pointer overflow-hidden rounded-[1.75rem] p-6 text-center transition-colors ${dragging ? "ring-2 ring-[#00e5c0]" : ""}`}>
            <input ref={inputRef} type="file" accept=".stl,.obj,.step,.stp,.iges,.igs,.3mf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) accept(f); }} />

            {buffer ? (
              <div className="relative">
                <StlViewer buffer={buffer} className="h-[260px] w-full sm:h-[320px]" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0">
                  <Pill tone="brand">{file?.name}</Pill>
                </div>
              </div>
            ) : (
              <div className="py-10">
                <motion.div
                  animate={{ y: dragging ? -6 : 0 }}
                  transition={{ type: "spring", bounce: 0.3, duration: 0.4 }}
                  className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-[#00e5c0] to-[#7c5cff] shadow-xl shadow-[#7c5cff]/25">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#05060b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 16V4m0 0L8 8m4-4l4 4" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
                  </svg>
                </motion.div>
                <div className="mt-5 text-[16px] font-bold">{file ? file.name : t.quote.drop}</div>
                <div className="muted mt-1.5 text-[12.5px]">{t.quote.dropSub}</div>
              </div>
            )}
          </motion.div>

          {!file && (
            <div className="glass rounded-3xl p-5">
              <div className="text-[13.5px] font-bold">{t.quote.manual}</div>
              <div className="mt-3 flex gap-2">
                <input type="number" min="0.1" step="0.1" value={manualVol}
                  onChange={(e) => setManualVol(e.target.value)}
                  placeholder={t.quote.manualVolume}
                  className="hairline w-full rounded-2xl border bg-transparent px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-[#00e5c0]/50" />
                <button onClick={run} className="pressable rounded-2xl bg-[rgb(var(--line)/0.1)] px-5 py-3 text-[13.5px] font-bold">
                  {t.quote.manualGo}
                </button>
              </div>
            </div>
          )}

          {/* Technology */}
          <div className="glass rounded-3xl p-5">
            <div className="mb-3 text-[13.5px] font-bold">{t.quote.technology}</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {techs.map((tc) => (
                <button key={tc.code} onClick={() => setTech(tc.code)}
                  className={`pressable hairline rounded-2xl border p-3.5 text-start transition-colors ${tech === tc.code ? "bg-gradient-to-br from-[#00e5c0]/16 to-[#7c5cff]/16 ring-1 ring-[#00e5c0]/50" : "hover:bg-[rgb(var(--line)/0.05)]"}`}>
                  <div className="text-[13.5px] font-bold">{lang === "fa" ? tc.name_fa : tc.name_en}</div>
                  <div className="muted mt-1 text-[11.5px] leading-relaxed">{lang === "fa" ? tc.desc_fa : tc.desc_en}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Material */}
          <div className="glass rounded-3xl p-5">
            <div className="mb-3 text-[13.5px] font-bold">{t.quote.material}</div>
            <div className="flex flex-wrap gap-2">
              {shown.map((m) => (
                <button key={m.slug} onClick={() => setMaterial(m.slug)}
                  className={`pressable hairline flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${material === m.slug ? "ring-1 ring-[#00e5c0]/60" : "hover:bg-[rgb(var(--line)/0.05)]"}`}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color_hex }} />
                  {lang === "fa" ? m.name_fa : m.name_en}
                </button>
              ))}
            </div>
          </div>

          {/* Knobs */}
          <div className="glass grid gap-5 rounded-3xl p-5 sm:grid-cols-2">
            <div>
              <div className="mb-2.5 text-[13.5px] font-bold">{t.quote.quality}</div>
              <div className="hairline flex rounded-2xl border p-1">
                {(["draft", "standard", "fine"] as const).map((q) => (
                  <button key={q} onClick={() => setQuality(q)}
                    className={`relative flex-1 rounded-xl px-2 py-2 text-[12.5px] font-bold transition-colors ${quality === q ? "" : "muted"}`}>
                    {quality === q && (
                      <motion.span layoutId="q-pill" className="absolute inset-0 rounded-xl bg-[rgb(var(--line)/0.1)]"
                        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }} />
                    )}
                    <span className="relative">{t.quote[q]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2.5 flex items-center justify-between text-[13.5px] font-bold">
                <span>{t.quote.quantity}</span>
                <span className="text-gradient">{num(quantity, lang)}</span>
              </div>
              <input type="range" min={1} max={100} value={quantity} className="range w-full"
                onChange={(e) => setQuantity(+e.target.value)} />
            </div>

            <div className={tech === "FDM" ? "" : "pointer-events-none opacity-40"}>
              <div className="mb-2.5 flex items-center justify-between text-[13.5px] font-bold">
                <span>{t.quote.infill}</span>
                <span className="text-gradient">{num(infill, lang)}٪</span>
              </div>
              <input type="range" min={10} max={100} step={5} value={infill} className="range w-full"
                onChange={(e) => setInfill(+e.target.value)} />
            </div>

            <div>
              <div className="mb-2.5 text-[13.5px] font-bold">{t.quote.city}</div>
              <select value={city} onChange={(e) => setCity(e.target.value)}
                className="hairline w-full rounded-2xl border bg-[var(--bg-soft)] px-4 py-3 text-[13.5px] font-semibold outline-none focus:ring-2 focus:ring-[#00e5c0]/50">
                {cities.map((c) => (
                  <option key={c.code} value={c.code}>{lang === "fa" ? c.name_fa : c.name_en}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Right: live result, sticky ── */}
        <div className="lg:sticky lg:top-24 lg:h-fit">
          <AnimatePresence mode="wait">
            {busy && !result ? (
              <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="glass grid h-64 place-items-center rounded-[1.75rem]">
                <div className="text-center">
                  <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#00e5c0] border-t-transparent" />
                  <div className="muted mt-4 text-[13px]">{t.quote.analyzing}</div>
                </div>
              </motion.div>
            ) : result ? (
              <motion.div key="res"
                initial={{ opacity: 0, y: 16, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ type: "spring", bounce: 0, duration: 0.5 }}
                className="space-y-4">
                <div className="glass relative overflow-hidden rounded-[1.75rem] p-6">
                  <div className="absolute -end-16 -top-16 h-44 w-44 rounded-full bg-[#00e5c0]/25 blur-3xl" />
                  <div className="relative flex items-center justify-between">
                    <span className="text-[13.5px] font-bold">{t.quote.results}</span>
                    <Pill tone={result.mesh.exact ? "ok" : "warn"}>
                      {result.mesh.exact ? t.quote.exact : t.quote.estimated}
                    </Pill>
                  </div>

                  <div className="relative mt-5">
                    <div className="muted text-[12px] font-semibold">{t.quote.total}</div>
                    <motion.div key={result.pricing.total_price}
                      initial={{ opacity: 0.4, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                      className="text-gradient mt-1 text-[clamp(1.9rem,5vw,2.8rem)] font-extrabold tabular-nums">
                      {money(result.pricing.total_price, lang)}
                      <span className="muted ms-2 text-base font-bold">{t.common.toman}</span>
                    </motion.div>
                  </div>

                  <dl className="hairline relative mt-5 space-y-2.5 border-t pt-4 text-[13px]">
                    <Row k={t.quote.unit} v={`${money(result.pricing.unit_price, lang)} ${t.common.toman}`} />
                    <Row k={t.quote.subtotal} v={`${money(result.pricing.subtotal, lang)} ${t.common.toman}`} />
                    <Row k={t.quote.fee} v={`${money(result.pricing.platform_fee, lang)} ${t.common.toman}`} />
                    <Row k={t.quote.lead} v={`${num(result.pricing.lead_time_days, lang)} ${t.quote.days}`} strong />
                  </dl>

                  <div className="hairline mt-4 grid grid-cols-3 gap-2 border-t pt-4 text-center">
                    <Cell k={t.quote.volume} v={`${num(result.mesh.volume_cm3, lang)}`} sub={t.quote.cm3} />
                    <Cell k={t.quote.bbox} v={bbox.map((b) => num(Math.round(b), lang)).join("×")} sub="mm" />
                    <Cell k={t.quote.hours} v={num(result.pricing.print_hours, lang)} sub="h" />
                  </div>
                </div>

                {result.warnings.length > 0 && (
                  <div className="glass space-y-2 rounded-[1.5rem] p-5">
                    {result.warnings.map((w) => (
                      <div key={w} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed">
                        <span className="mt-0.5 text-amber-500">▲</span>
                        <span className="muted">{(t.quote.warn as Record<string, string>)[w] ?? w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {result.matches.length > 0 && (
                  <div className="glass rounded-[1.5rem] p-5">
                    <div className="mb-3 text-[13.5px] font-bold">{t.quote.matches}</div>
                    <div className="space-y-2">
                      {result.matches.map((m) => (
                        <button key={m.hub.id} onClick={() => setHub(m.hub.id)}
                          className={`pressable hairline flex w-full items-center gap-3 rounded-2xl border p-3 text-start transition-colors ${hub === m.hub.id ? "ring-1 ring-[#00e5c0]/60" : "hover:bg-[rgb(var(--line)/0.05)]"}`}>
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#00e5c0]/25 to-[#7c5cff]/25 text-[12px] font-extrabold">
                            {num(m.hub.rating, lang)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-bold">{lang === "fa" ? m.hub.name_fa : m.hub.name_en}</span>
                            <span className="muted block text-[11.5px]">
                              {lang === "fa" ? m.hub.city_fa : m.hub.city_en} • {num(m.hub.lead_time_days, lang)} {t.quote.days}
                            </span>
                          </span>
                          {m.local && <Pill tone="brand">{t.quote.local}</Pill>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="glass space-y-3 rounded-[1.5rem] p-5">
                  {!user && (
                    <Link href="/login?next=/quote" className="muted block text-center text-[12.5px] font-semibold underline">
                      {t.quote.loginFirst}
                    </Link>
                  )}
                  <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t.quote.address}
                    className="hairline w-full rounded-2xl border bg-transparent px-4 py-3 text-[13.5px] outline-none focus:ring-2 focus:ring-[#00e5c0]/50" />
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.quote.note} rows={2}
                    className="hairline w-full resize-none rounded-2xl border bg-transparent px-4 py-3 text-[13.5px] outline-none focus:ring-2 focus:ring-[#00e5c0]/50" />
                  {error && <p className="text-[12.5px] font-semibold text-rose-500">{error}</p>}
                  <button onClick={placeOrder} disabled={placing}
                    className="pressable w-full rounded-2xl bg-gradient-to-r from-[#00e5c0] to-[#7c5cff] px-6 py-3.5 text-[14.5px] font-extrabold text-[#05060b] shadow-xl shadow-[#7c5cff]/25 disabled:opacity-60">
                    {placing ? t.common.loading : t.quote.submit}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="glass grid h-64 place-items-center rounded-[1.75rem] p-8 text-center">
                <p className="muted text-[13.5px] leading-[2]">{t.quote.sub}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="muted">{k}</dt>
      <dd className={`tabular-nums ${strong ? "font-extrabold" : "font-semibold"}`}>{v}</dd>
    </div>
  );
}

function Cell({ k, v, sub }: { k: string; v: string; sub: string }) {
  return (
    <div>
      <div className="muted text-[11px] font-semibold">{k}</div>
      <div className="mt-1 text-[13.5px] font-extrabold tabular-nums">{v}</div>
      <div className="muted text-[10.5px]">{sub}</div>
    </div>
  );
}
