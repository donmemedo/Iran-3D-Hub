export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://localhost:8400";

const TOKEN_KEY = "h3d_token";
const TIMEOUT_MS = 20000;
const UPLOAD_TIMEOUT_MS = 60000;

/** `code` is the backend `detail` string, "network_error" (fetch failure/timeout) or "unknown". */
export class ApiError extends Error {
  status: number;
  code: string;
  retryAfter?: number;
  constructor(status: number, code: string, retryAfter?: number) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function token(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function setToken(t: string | null): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

// Proxies in front of the API may answer without a JSON body for these.
const STATUS_FALLBACK: Record<number, string> = { 413: "payload_too_large", 429: "too_many_requests" };

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  // Content-Type only on string bodies: anonymous GETs stay CORS "simple" requests (no preflight)
  // and multipart uploads keep the browser-generated boundary.
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const t = token();
  if (t) headers.set("Authorization", `Bearer ${t}`);

  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  const ctrl = new AbortController();
  const abort = () => ctrl.abort();
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, isForm ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS);

  try {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers,
        credentials: "omit", // Bearer token only; never send cookies cross-origin
        signal: ctrl.signal,
      });
    } catch {
      throw new ApiError(0, "network_error");
    }

    // The timeout also covers reading the body; an abort mid-body is a network failure.
    const text = await res.text().catch(() => { throw new ApiError(0, "network_error"); });

    if (!res.ok) {
      let code = STATUS_FALLBACK[res.status] ?? "unknown";
      try {
        const d = JSON.parse(text)?.detail;
        if (typeof d === "string") code = d;
      } catch {}
      const ra = Number(res.headers.get("Retry-After"));
      // A wrong password is a 401 too, but it says nothing about the stored session.
      if (res.status === 401 && t && code !== "invalid_credentials") {
        setToken(null);
        if (typeof window !== "undefined") window.dispatchEvent(new Event("h3d:logout"));
      }
      throw new ApiError(res.status, code, Number.isFinite(ra) && ra > 0 ? ra : undefined);
    }

    if (res.status === 204 || !text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(res.status, "unknown");
    }
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}

export const post = <T = any>(path: string, body: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

export const upload = <T = any>(path: string, form: FormData) =>
  api<T>(path, { method: "POST", body: form });
