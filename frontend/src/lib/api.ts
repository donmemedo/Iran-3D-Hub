export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") || "http://localhost:8400";

export function token(): string | null {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem("h3d_token"); } catch { return null; }
}

async function handle(res: Response) {
  if (!res.ok) {
    let detail = String(res.status);
    try { detail = (await res.json()).detail ?? detail; } catch {}
    throw new Error(detail);
  }
  return res.json();
}

export function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const t = token();
  if (t) headers.set("Authorization", `Bearer ${t}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers }).then(handle);
}

export const post = (path: string, body: unknown) =>
  api(path, { method: "POST", body: JSON.stringify(body) });

export const upload = (path: string, form: FormData) =>
  api(path, { method: "POST", body: form });
