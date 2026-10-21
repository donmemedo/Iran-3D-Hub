import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

/** Origin of the backend API (build-time env), so connect-src is as narrow as possible. */
function apiOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8400").origin;
  } catch {
    return "http://localhost:8400";
  }
}

/*
 * script-src keeps 'unsafe-inline' on purpose: Next.js App Router emits inline
 * bootstrap/flight scripts (self.__next_f.push) and layout.tsx ships one constant,
 * user-data-free theme-init script that must run before first paint. A per-request
 * nonce (middleware + `strict-dynamic`) is the upgrade path, but it forces every page
 * to render dynamically and gives up static caching, so it is deferred.
 * 'unsafe-eval' is dev-only (React/Next refresh needs eval); never shipped in production.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self' ${apiOrigin()}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

const config: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        ],
      },
      // Self-hosted fonts and icons: long-lived, never revalidated.
      { source: "/fonts/:path*", headers: immutable },
      // Explicit paths: path-to-regexp cannot repeat a parameter after a literal prefix like "/icon-".
      ...["/icon-192.png", "/icon-512.png", "/icon-maskable.png", "/icon.svg"].map((source) => ({ source, headers: immutable })),
      // The service worker script itself must always be re-fetched so updates ship.
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
    ];
  },
};

export default config;
