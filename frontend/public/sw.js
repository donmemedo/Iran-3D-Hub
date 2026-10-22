/* 3D Hub Iran service worker (h3d-v2).
   Rules:
   - GET + same-origin only; /api/ is never intercepted (auth/orders/quotes are no-store).
   - Page navigations: network-first, offline falls back to the cached page, then cached "/".
   - Static assets (/_next/static/, /fonts/, /icon*, /manifest*): stale-while-revalidate.
   - Only 200 "basic" (same-origin) responses are ever cached; errors never are.
   - Install pre-caches the shell one URL at a time so a single 404 cannot break install. */
const CACHE = "h3d-v2";
const SHELL = ["/", "/quote", "/hubs", "/manifest.webmanifest", "/icon.svg"];

const cacheable = (res) => res.ok && res.status === 200 && res.type === "basic";
const isStatic = (p) =>
  p.startsWith("/_next/static/") || p.startsWith("/fonts/") || p.startsWith("/icon") || p.startsWith("/manifest");

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      for (const url of SHELL) {
        try { await c.add(url); } catch { /* skip: one bad URL must not fail install */ }
      }
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  const c = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (cacheable(res)) c.put(req, res.clone()).catch(() => {});
    return res;
  } catch {
    return (await c.match(req)) || (await c.match("/")) || Response.error();
  }
}

async function staleWhileRevalidate(req, e) {
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  const refresh = fetch(req).then((res) => {
    if (cacheable(res)) c.put(req, res.clone()).catch(() => {});
    return res;
  });
  if (hit) { e.waitUntil(refresh.catch(() => {})); return hit; }
  return refresh;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") e.respondWith(networkFirst(req));
  else if (isStatic(url.pathname)) e.respondWith(staleWhileRevalidate(req, e));
});
