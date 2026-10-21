# Frontend image: Next.js standalone output, 3 stages, non-root, read-only-rootfs friendly.
#
# Base images are pinned by tag only. Pin the digest as well
# (node:22-alpine@sha256:<digest>) in CI with Renovate or Dependabot's docker ecosystem
# (see .github/dependabot.yml); never hand-write a digest.

# ---- deps: install exactly what package-lock.json says ----------------------------
FROM node:22-alpine AS deps
WORKDIR /app
# `npm ci` only. It fails if the lockfile and package.json disagree; falling back to
# `npm install` would silently re-resolve versions and defeat the lockfile.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- builder ----------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined into the browser bundle at build time and are public.
# Never put a secret in them. NEXT_PUBLIC_DEMO=1 shows the demo-login button (demos only).
ARG NEXT_PUBLIC_API_BASE=http://localhost:8400
ARG NEXT_PUBLIC_DEMO=
ENV NEXT_PUBLIC_API_BASE=$NEXT_PUBLIC_API_BASE \
    NEXT_PUBLIC_DEMO=$NEXT_PUBLIC_DEMO \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner -----------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

# HOSTNAME=0.0.0.0: Docker sets HOSTNAME to the container id otherwise, and the standalone
# server would bind only that address (the healthcheck on 127.0.0.1 would fail).
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs \
 && adduser -S -H -u 1001 -G nodejs -s /sbin/nologin nextjs

# Code stays root-owned (not writable by the app). Only .next/cache is writable, for the
# image optimiser; docker-compose.yml mounts a tmpfs over it so the root fs can be read-only.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
RUN mkdir -p /app/.next/cache && chown nextjs:nodejs /app/.next/cache

USER nextjs
EXPOSE 3000

# Node 22 has global fetch: no curl or wget needed in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/',{signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "server.js"]
