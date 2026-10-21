"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useApp } from "@/components/Providers";
import { Pill } from "@/components/Bits";
import { api, ApiError, post } from "@/lib/api";
import type { Dict } from "@/lib/i18n";
import { money, num } from "@/lib/format";

// three.js is only needed once a file has been dropped, so keep it out of the route bundle.
const StlViewer = dynamic(() => import("@/components/StlViewer").then((m) => m.StlViewer), {
  ssr: false,
  loading: () => <div className="h-[260px] w-full sm:h-[320px]" aria-hidden />,
});

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

const MB = 1024 * 1024;
const MAX_UPLOAD = 60 * MB; // server limit
const MAX_VIEW = 30 * MB;   // StlViewer limit: larger files are uploaded but not read into memory
const EXTS = [".stl", ".obj", ".step", ".stp", ".iges", ".igs", ".3mf"];
const MIN_VOL = 0.1;
const MAX_VOL = 100_000;
// Warnings that describe the file itself. The manual re-quote cannot know them, so we carry them over.
const FILE_WARNINGS = new Set(["non_manifold", "mesh_truncated", "needs_engineer_review", "estimated_from_file", "empty_mesh"]);

const errCode = (e: unknown) => (e instanceof ApiError ? e.code : "unknown");

/** Errors are kept as codes and turned into text at render time, so they follow the language switch. */
function errText(t: Dict, code: string) {
  if (code === "empty") return t.quote.empty;
  if (code === "network_error") return t.errors.network;
  return (t.errors as Record<string, string>)[code] ?? t.errors.unknown;
}

export default function QuotePage() {
  const { t, lang, user } = useApp();
  const router = useRouter();

  const [materials, setMaterials] = useState<Material[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [techs, setTechs] = useState<Tech[]>([]);
  const [catalogTry, setCatalogTry] = useState(0);
  const [catalogError, setCatalogError] = useState("");

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
  const [quoteError, setQuoteError] = useState("");
  const [orderError, setOrderError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [mesh, setMesh] = useState<Result["mesh"] | null>(null);

  const [hub, setHub] = useState<number | null>(null);
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [placing, setPlacing] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const ctl = useRef<AbortController | null>(null); // the one in-flight quote request
  const reqId = useRef(0);                          // only the latest request id may write state
  const bufId = useRef(0);                          // same guard for async file reads
  const meshWarn = useRef<string[]>([]);

  useEffect(() => {
    const ac = new AbortController();
    setCatalogError("");
    const get = <T,>(path: string, set: (v: T) => void) => api<T>(path, { signal: ac.signal }).then(set);
    Promise.all([
      get<Material[]>("/api/materials", setMaterials),
      get<City[]>("/api/cities", setCities),
      get<Tech[]>("/api/technologies", setTechs),
    ]).catch((e: unknown) => { if (!ac.signal.aborted) setCatalogError(errCode(e)); });
    return () => ac.abort();
  }, [catalogTry]);

  const shown = materials.filter((m) => m.technology === tech);
  useEffect(() => {
    if (shown.length && !shown.some((m) => m.slug === material)) setMaterial(shown[0].slug);
  }, [tech, materials]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = useCallback(async () => {
    const analyzing = file !== null && mesh === null;
    if (!analyzing) {
      // Manual input: ignore NaN / still-typing values, refuse absurd ones before the server has to.
      const v = mesh ? mesh.volume_cm3 : parseFloat(manualVol);
      if (!(v > 0) || (!mesh && v < MIN_VOL)) { setQuoteError(""); return; }
      if (!mesh && v > MAX_VOL) { setQuoteError("volume_out_of_range"); return; }
    }

    ctl.current?.abort();
    const ac = new AbortController();
    ctl.current = ac;
    const id = ++reqId.current;
    const stale = () => ac.signal.aborted || id !== reqId.current;

    setQuoteError("");
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
        res = await api<Result>("/api/quotes/analyze", { method: "POST", body: form, signal: ac.signal });
        if (stale()) return;
        meshWarn.current = res.warnings.filter((w) => FILE_WARNINGS.has(w));
        setMesh(res.mesh);
      } else {
        // The mesh is already measured (or typed in), so re-price from the
        // known volume instead of re-uploading the file on every knob turn.
        const v = mesh ? mesh.volume_cm3 : parseFloat(manualVol);
        res = await api<Result>("/api/quotes/manual", {
          method: "POST",
          signal: ac.signal,
          body: JSON.stringify({
            volume_cm3: v, bbox: mesh?.bbox ?? [60, 60, 60],
            material_slug: material, quality, infill, quantity, city,
            filename: file ? file.name.slice(0, 120) : lang === "fa" ? "ورودی دستی" : "manual entry",
          }),
        });
        if (stale()) return;
        if (mesh) res = { ...res, mesh, warnings: Array.from(new Set([...meshWarn.current, ...res.warnings])) };
      }
      setResult(res);
      // Keep the producer the user picked while it is still a valid match.
      setHub((cur) => (res.matches.some((m) => m.hub.id === cur) ? cur : res.matches[0]?.hub.id ?? null));
    } catch (e: unknown) {
      // An aborted or superseded request is not an error the user should see.
      if (!stale()) setQuoteError(errCode(e));
    } finally {
      if (id === reqId.current) setBusy(false);
    }
  }, [file, mesh, manualVol, material, quality, infill, quantity, city, lang]);

  // Re-quote whenever a knob changes — feedback is continuous, not on submit.
  // The cleanup aborts the in-flight request the moment a knob moves again.
  useEffect(() => {
    if (!file && !manualVol) return;
    const id = setTimeout(run, 260);
    return () => { clearTimeout(id); ctl.current?.abort(); };
  }, [material, quality, infill, quantity, city, file, manualVol]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => ctl.current?.abort(), []);

  const accept = (f: File) => {
    const name = f.name.toLowerCase();
    if (f.size > MAX_UPLOAD) { setQuoteError("file_too_large"); return; }
    if (!EXTS.some((x) => name.endsWith(x))) { setQuoteError("unsupported_file_type"); return; }
    setQuoteError("");
    setFile(f);
    setResult(null);
    setMesh(null);   // a new file must be measured again
    setBuffer(null);
    // Only STL has a viewer, and only below its size limit; everything else is uploaded unread.
    const mine = ++bufId.current;
    if (name.endsWith(".stl") && f.size <= MAX_VIEW) {
      f.arrayBuffer().then((b) => { if (bufId.current === mine) setBuffer(b); }).catch(() => {});
    }
  };

  const openPicker = () => inputRef.current?.click();

  const placeOrder = async () => {
    if (!result || placing) return;
    if (!user) { router.push("/login?next=/quote"); return; }
    const addr = address.trim();
    if (!addr) { setOrderError("empty"); return; }
    if (addr.length < 5) { setOrderError("validation_error"); return; }
    setPlacing(true);
    setOrderError("");
    try {
      await post("/api/orders", {
        quote_public_id: result.quote.public_id, hub_id: hub, address: addr, note: note.trim(),
      });
      router.push("/dashboard");
    } catch (e: unknown) {
      const code = errCode(e);
      setOrderError(code);
      // The signed quote expired: price it again so the next click works.
      if (code === "invalid_quote") void run();
    } finally {
      setPlacing(false);
    }
  };

  const bbox = result?.mesh.bbox ?? [0, 0, 0];
  const pct = lang === "fa" ? "٪" : "%";
  const fdm = tech === "FDM";

  return (
    <div className="mx-auto max-w-7xl px-5 pb-20">
      <header className="py-8">
        <h1 className="text-[clamp(1.8rem,4.4vw,3rem)] font-extrabold">{t.quote.title}</h1>
        <p className="muted mt-3 text-[15px]">{t.quote.sub}</p>
      </header>

      {catalogError && (
        <div role="alert" className="glass mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl px-5 py-3 text-[13px] font-semibold text-rose-500">
          <span>{errText(t, catalogError)}</span>
          <button type="button" onClick={() => setCatalogTry((n) => n + 1)}
            className="pressable rounded-xl bg-[rgb(var(--line)/0.09)] px-4 py-1.5 text-[12.5px] font-bold text-[var(--fg)]">
            {t.common.retry}
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        {/* ── Left: upload + configuration ── */}
        <div className="space-y-4">
          <motion.div
            role="button"
            tabIndex={0}
            aria-label={file ? `${t.a11y.dropzone} ${file.name}` : t.a11y.dropzone}
            onKeyDown={(e) => {
              if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openPicker(); }
            }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) accept(f); }}
            onClick={openPicker}
            animate={{ scale: dragging ? 1.015 : 1 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className={`glass relative cursor-pointer overflow-hidden rounded-[1.75rem] p-6 text-center outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#00e5c0] ${dragging ? "ring-2 ring-[#00e5c0]" : ""}`}>
            <input ref={inputRef} type="file" accept=".stl,.obj,.step,.stp,.iges,.igs,.3mf" className="hidden" tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) accept(f); e.target.value = ""; }} />

            {buffer ? (
              <div className="relative">
                <div role="img" aria-label={t.a11y.viewer}>
                  <StlViewer buffer={buffer} className="h-[260px] w-full sm:h-[320px]" />
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0">
                  <Pill tone="brand">{file?.name}</Pill>
                </div>
              </div>
            ) : (
              <div className="py-10">
                <motion.div
                  animate={{ y: dragging ? -6 : 0 }}
                  transition={{ type: "spring", bounce: 0, duration: 0.4 }}
                  className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-[#00e5c0] to-[#7c5cff] shadow-xl shadow-[#7c5cff]/25">
                  <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#05060b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 16V4m0 0L8 8m4-4l4 4" /><path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
                  </svg>
                </motion.div>
                <div className="mt-5 text-[16px] font-bold">{file ? file.name : t.quote.drop}</div>
                <div className="muted mt-1.5 text-[12.5px]">{t.quote.dropSub}</div>
              </div>
            )}
          </motion.div>

          {quoteError && (
            <p role="alert" className="px-2 text-[12.5px] font-semibold text-rose-500">{errText(t, quoteError)}</p>
          )}

          {!file && (
            <form className="glass rounded-3xl p-5" onSubmit={(e) => { e.preventDefault(); void run(); }}>
              <div className="text-[13.5px] font-bold">{t.quote.manual}</div>
              <div className="mt-3 flex gap-2">
                <input type="number" min={MIN_VOL} max={MAX_VOL} step="0.1" inputMode="decimal" value={manualVol}
                  onChange={(e) => setManualVol(e.target.value)}
                  placeholder={t.quote.manualVolume}
                  aria-label={t.quote.manualVolume}
                  className="hairline w-full rounded-2xl border bg-transparent px-4 py-3 text-[14px] outline-none focus:ring-2 focus:ring-[#00e5c0]/50" />
                <button type="submit" className="pressable rounded-2xl bg-[rgb(var(--line)/0.1)] px-5 py-3 text-[13.5px] font-bold">
                  {t.quote.manualGo}
                </button>
              </div>
            </form>
          )}

          {/* Technology */}
          <div className="glass rounded-3xl p-5">
            <div id="q-tech" className="mb-3 text-[13.5px] font-bold">{t.quote.technology}</div>
            <div role="group" aria-labelledby="q-tech" className="grid gap-2 sm:grid-cols-3">
              {techs.map((tc) => (
                <button key={tc.code} type="button" aria-pressed={tech === tc.code} onClick={() => setTech(tc.code)}
                  className={`pressable hairline rounded-2xl border p-3.5 text-start transition-colors ${tech === tc.code ? "bg-gradient-to-br from-[#00e5c0]/16 to-[#7c5cff]/16 ring-1 ring-[#00e5c0]/50" : "hover:bg-[rgb(var(--line)/0.05)]"}`}>
                  <div className="text-[13.5px] font-bold">{lang === "fa" ? tc.name_fa : tc.name_en}</div>
                  <div className="muted mt-1 text-[11.5px] leading-relaxed">{lang === "fa" ? tc.desc_fa : tc.desc_en}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Material */}
          <div className="glass rounded-3xl p-5">
            <div id="q-material" className="mb-3 text-[13.5px] font-bold">{t.quote.material}</div>
            <div role="group" aria-labelledby="q-material" className="flex flex-wrap gap-2">
              {shown.map((m) => (
                <button key={m.slug} type="button" aria-pressed={material === m.slug} onClick={() => setMaterial(m.slug)}
                  className={`pressable hairline flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-[13px] font-semibold transition-colors ${material === m.slug ? "ring-1 ring-[#00e5c0]/60" : "hover:bg-[rgb(var(--line)/0.05)]"}`}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color_hex }} aria-hidden />
                  {lang === "fa" ? m.name_fa : m.name_en}
                </button>
              ))}
            </div>
          </div>

          {/* Knobs */}
          <div className="glass grid gap-5 rounded-3xl p-5 sm:grid-cols-2">
            <div>
              <div id="q-quality" className="mb-2.5 text-[13.5px] font-bold">{t.quote.quality}</div>
              <div role="group" aria-labelledby="q-quality" className="hairline flex rounded-2xl border p-1">
                {(["draft", "standard", "fine"] as const).map((q) => (
                  <button key={q} type="button" aria-pressed={quality === q} onClick={() => setQuality(q)}
                    className={`relative flex-1 rounded-xl px-2 py-2 text-[12.5px] font-bold transition-colors ${quality === q ? "" : "muted"}`}>
                    {quality === q && (
                      <motion.span layoutId="q-pill" className="absolute inset-0 rounded-xl bg-[rgb(var(--line)/0.1)]"
                        transition={{ type: "spring", bounce: 0, duration: 0.4 }} />
                    )}
                    <span className="relative">{t.quote[q]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2.5 flex items-center justify-between text-[13.5px] font-bold">
                <span aria-hidden>{t.quote.quantity}</span>
                <span className="text-gradient" aria-hidden>{num(quantity, lang)}</span>
              </div>
              <input type="range" min={1} max={100} value={quantity} className="range w-full"
                aria-label={t.quote.quantity} aria-valuetext={num(quantity, lang)}
                onChange={(e) => setQuantity(+e.target.value)} />
            </div>

            <div className={fdm ? "" : "opacity-40"}>
              <div className="mb-2.5 flex items-center justify-between text-[13.5px] font-bold">
                <span aria-hidden>{t.quote.infill}</span>
                <span className="text-gradient" aria-hidden>{num(infill, lang)}{pct}</span>
              </div>
              <input type="range" min={10} max={100} step={5} value={infill} className="range w-full" disabled={!fdm}
                aria-label={t.quote.infill} aria-valuetext={`${num(infill, lang)}${pct}`}
                onChange={(e) => setInfill(+e.target.value)} />
            </div>

            <div>
              <label htmlFor="q-city" className="mb-2.5 block text-[13.5px] font-bold">{t.quote.city}</label>
              <select id="q-city" value={city} onChange={(e) => setCity(e.target.value)} aria-label={t.quote.city}
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
              <motion.div key="busy" role="status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="glass grid h-64 place-items-center rounded-[1.75rem]">
                <div className="text-center">
                  <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#00e5c0] border-t-transparent" aria-hidden />
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
                  <div className="absolute -end-16 -top-16 h-44 w-44 rounded-full bg-[#00e5c0]/25 blur-3xl" aria-hidden />
                  <div aria-live="polite" aria-atomic="true" aria-busy={busy} className="relative">
                    <div className="flex items-center justify-between">
                      <span className="text-[13.5px] font-bold">{t.quote.results}</span>
                      <Pill tone={result.mesh.exact ? "ok" : "warn"}>
                        {result.mesh.exact ? t.quote.exact : t.quote.estimated}
                      </Pill>
                    </div>

                    <div className="mt-5">
                      <div className="muted text-[12px] font-semibold">{t.quote.total}</div>
                      <motion.div key={result.pricing.total_price}
                        initial={{ opacity: 0.4, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                        className="text-gradient mt-1 text-[clamp(1.9rem,5vw,2.8rem)] font-extrabold tabular-nums">
                        {money(result.pricing.total_price, lang)}
                        <span className="muted ms-2 text-base font-bold">{t.common.toman}</span>
                      </motion.div>
                    </div>

                    <dl className="hairline mt-5 space-y-2.5 border-t pt-4 text-[13px]">
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
                </div>

                {result.warnings.length > 0 && (
                  <div className="glass space-y-2 rounded-[1.5rem] p-5">
                    {result.warnings.map((w) => (
                      <div key={w} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed">
                        <span className="mt-0.5 text-amber-500" aria-hidden>▲</span>
                        <span className="muted">{(t.quote.warn as Record<string, string>)[w] ?? w}</span>
                      </div>
                    ))}
                  </div>
                )}

                {result.matches.length > 0 && (
                  <div className="glass rounded-[1.5rem] p-5">
                    <div id="q-matches" className="mb-3 text-[13.5px] font-bold">{t.quote.matches}</div>
                    <div role="group" aria-labelledby="q-matches" className="space-y-2">
                      {result.matches.map((m) => (
                        <button key={m.hub.id} type="button" aria-pressed={hub === m.hub.id} onClick={() => setHub(m.hub.id)}
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
                  <input value={address} onChange={(e) => { setAddress(e.target.value); setOrderError(""); }}
                    placeholder={t.quote.address} aria-label={t.quote.address} maxLength={500} autoComplete="street-address"
                    className="hairline w-full rounded-2xl border bg-transparent px-4 py-3 text-[13.5px] outline-none focus:ring-2 focus:ring-[#00e5c0]/50" />
                  <textarea value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder={t.quote.note} aria-label={t.quote.note} maxLength={1000} rows={2}
                    className="hairline w-full resize-none rounded-2xl border bg-transparent px-4 py-3 text-[13.5px] outline-none focus:ring-2 focus:ring-[#00e5c0]/50" />
                  {orderError && <p role="alert" className="text-[12.5px] font-semibold text-rose-500">{errText(t, orderError)}</p>}
                  <button type="button" onClick={placeOrder} disabled={placing} aria-busy={placing}
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
