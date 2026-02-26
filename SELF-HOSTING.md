# Self-Hosting Checklist

This document tracks every configuration change needed to fork and self-host the entire Happy Coder system (server, CLI, mobile app) under your own infrastructure.

---

## 1. Server Deployment (happy-server)

The simplest path is the standalone Docker image which bundles PGlite (embedded Postgres) and local file storage — no external database or S3 needed.

- [ ] **Set `HANDY_MASTER_SECRET`** — Generate a strong random secret (e.g. `openssl rand -hex 32`). Used for auth/encryption. **Required, no default.**
  - Pass as env var to Docker or set in your `.env` file

- [ ] **Configure `DATABASE_URL`** (multi-service only) — PostgreSQL connection string.
  - Default (dev): `postgresql://postgres:postgres@localhost:5432/handy`
  - File: `packages/happy-server/.env.dev`
  - Standalone Docker uses embedded PGlite — no external DB needed.

- [ ] **Configure `REDIS_URL`** (optional) — Only needed for distributed caching.
  - Format: `redis://host:port`
  - Not required for standalone deployment.

- [ ] **Configure S3/MinIO storage** (multi-service only) — Set these env vars:
  - `S3_HOST` — S3 endpoint (default: `localhost`)
  - `S3_PORT` — S3 port (default: `9000`)
  - `S3_ACCESS_KEY` — Access key (default: `minioadmin`)
  - `S3_SECRET_KEY` — Secret key (default: `minioadmin`)
  - `S3_BUCKET` — Bucket name (default: `happy`)
  - `S3_PUBLIC_URL` — Public URL for file access (default: `http://localhost:9000/happy`)
  - `S3_USE_SSL` — `true` for production
  - `S3_REGION` — AWS region (default: `us-east-1`)
  - Standalone Docker stores files locally in `/data` — no S3 needed.

- [ ] **Set `PUBLIC_URL`** — Your server's public base URL.
  - Default: `http://localhost:3005`
  - Production example: `https://api.yourdomain.com`

- [ ] **Set `PORT`** if needed — Server port (default: `3005` standalone, `3000` multi-service).

- [ ] **Run database migrations** — Handled automatically in standalone Docker on startup.
  - Manual: `yarn migrate` or `tsx packages/happy-server/sources/standalone.ts migrate`
  - Migration files: `packages/happy-server/prisma/migrations/` (36 migrations)

- [ ] **Docker build & deploy**
  - **Standalone** (recommended for self-hosting): `Dockerfile` at repo root
    - Embeds PGlite, no external DB or Redis needed
    - Exposes port `3005`, volume `/data` for persistence
    - Command runs migrations on start, then serves
  - **Multi-service server**: `Dockerfile.server` — requires external PostgreSQL
    - Exposes port `3000`
  - **Web app**: `Dockerfile.webapp` — Nginx static file serving
    - Build args: `POSTHOG_API_KEY`, `REVENUE_CAT_STRIPE`
    - Exposes port `80`

---

## 2. CLI Configuration (happy-cli)

- [ ] **Update default `HAPPY_SERVER_URL`**
  - File: `packages/happy-cli/src/configuration.ts` (line ~32)
  - Current: `https://api.cluster-fluster.com`
  - Change to your server URL (e.g. `https://api.yourdomain.com`)

- [ ] **Update default `HAPPY_WEBAPP_URL`**
  - File: `packages/happy-cli/src/configuration.ts` (line ~33)
  - Current: `https://app.happy.engineering`
  - Change to your web app URL (e.g. `https://app.yourdomain.com`)

- [ ] **Publish to npm under your scope**
  - Update `name` in `packages/happy-cli/package.json`
  - Already set to `@homesoft/happy-coder` for this fork

---

## 3. Mobile App — Server Connection (happy-app)

- [ ] **Update default server URL**
  - File: `packages/happy-app/sources/sync/serverConfig.ts` (line ~7)
  - Current: `https://api.cluster-fluster.com`
  - Change to your server URL

- [ ] **Set `EXPO_PUBLIC_HAPPY_SERVER_URL`** in build configs
  - Overrides the hardcoded default at build time
  - Set in your EAS build environment or `.env` file

- [ ] **Note:** Users can also change the server URL at runtime via the app's Settings UI.

---

## 4. Mobile App — Firebase & Push Notifications

- [ ] **Create your own Firebase project** at [console.firebase.google.com](https://console.firebase.google.com)
  - Current project: `happy-coder-9fe36` (project number: `902947412706`)

- [ ] **Replace `google-services.json`** (Android)
  - File: `packages/happy-app/google-services.json`
  - Download your own from Firebase Console
  - Make sure package names match your bundle IDs (see Section 5)

- [ ] **Add `GoogleService-Info.plist`** (iOS)
  - Download from Firebase Console
  - Place in `packages/happy-app/` or configure via EAS

- [ ] **Update EAS project ID** for push token registration
  - See Section 5 for EAS project details

---

## 5. Mobile App — Bundle IDs & App Store

- [ ] **Change bundle IDs** in `packages/happy-app/app.config.js` (lines ~8-10)
  - Current values:
    - Development: `com.slopus.happy.dev`
    - Preview: `com.slopus.happy.preview`
    - Production: `com.ex3ndr.happy`
  - Change all three to your own identifiers

- [ ] **Update `eas.json`** with your Apple credentials
  - File: `packages/happy-app/eas.json` (lines ~52-54)
  - Current values:
    - Apple ID: `steve@bulkovo.com`
    - ASC App ID: `126165711`
    - Apple Team ID: `466DQWDR8C`
  - Replace with your own Apple Developer account details

- [ ] **Update EAS project ID and owner**
  - File: `packages/happy-app/app.config.js` (line ~166)
  - Current project ID: `4558dd3d-cd5a-47cd-bad9-e591a241cc06`
  - Current owner (line ~175): `bulkacorp`
  - Run `eas init` in `packages/happy-app/` to create your own project

- [ ] **Update Android signing certificate fingerprint**
  - File: `packages/happy-app/public/.well-known/assetlinks.json`
  - Current fingerprint: `0F:44:FB:74:85:39:DE:93:A9:F3:82:18:F7:26:19:8E:9A:64:D4:75:AF:46:CB:99:6B:22:5C:61:EA:6A:C2:74`
  - Current package: `com.ex3ndr.happy`
  - Replace both with your own values

---

## 6. Mobile App — Deep Links & Associated Domains

- [ ] **Update `associatedDomains`** in `app.config.js` (line ~39)
  - Current: `applinks:app.happy.engineering` (production only)
  - Change to `applinks:app.yourdomain.com`

- [ ] **Update Android intent filter host** in `app.config.js` (lines ~59-69)
  - Current host: `app.happy.engineering`
  - Change to your web app domain

- [ ] **Update `assetlinks.json`** for Android App Links
  - File: `packages/happy-app/public/.well-known/assetlinks.json`
  - Update package name and SHA256 fingerprint (see Section 5)

- [ ] **Host `apple-app-site-association`** on your domain
  - Source: `packages/happy-app/public/.well-known/apple-app-site-association`
  - Current Team ID: `466DQWDR8C`, Bundle ID: `466DQWDR8C.com.ex3ndr.happy`
  - Update both, then serve from `https://yourdomain.com/.well-known/apple-app-site-association`

---

## 7. Optional External Services

- [ ] **GitHub OAuth** — For GitHub integration features
  - Create your own GitHub OAuth App at [github.com/settings/developers](https://github.com/settings/developers)
  - Set server env vars:
    - `GITHUB_CLIENT_ID`
    - `GITHUB_CLIENT_SECRET`
    - `GITHUB_REDIRECT_URI`
  - For GitHub App features, also set:
    - `GITHUB_APP_ID`
    - `GITHUB_PRIVATE_KEY`
    - `GITHUB_WEBHOOK_SECRET`

- [ ] **PostHog** (analytics) — Optional
  - Set `EXPO_PUBLIC_POSTHOG_API_KEY` in app build config
  - Set up your own PostHog instance or use PostHog Cloud

- [ ] **RevenueCat** (in-app purchases) — Optional
  - Set env vars:
    - `EXPO_PUBLIC_REVENUE_CAT_APPLE`
    - `EXPO_PUBLIC_REVENUE_CAT_GOOGLE`
    - `EXPO_PUBLIC_REVENUE_CAT_STRIPE`

- [ ] **ElevenLabs** (voice features) — Optional
  - Server: set `ELEVENLABS_API_KEY`
  - App: set `EXPO_PUBLIC_ELEVENLABS_AGENT_ID_DEV` and `EXPO_PUBLIC_ELEVENLABS_AGENT_ID_PROD`

---

## 8. Docker & Deployment

- [ ] **Update Docker registry** in Kubernetes manifests
  - Current registry: `docker.korshakov.com`
  - Files to update:
    - `packages/happy-server/deploy/handy.yaml` (line ~26): image `docker.korshakov.com/handy-server`
    - `packages/happy-app/deploy/happy-app.yaml` (line ~17): image `docker.korshakov.com/happy-app`
  - Change to your own container registry (Docker Hub, GHCR, ECR, etc.)

- [ ] **Update `ExternalSecret` paths** in deployment YAMLs
  - Currently reference secrets manager paths specific to the original deployment
  - Replace with your own secrets manager configuration or use plain Kubernetes Secrets

- [ ] **Update S3 public URL in deployment config**
  - File: `packages/happy-server/deploy/handy.yaml` (line ~37)
  - Current: `https://files.cluster-fluster.com/happy`
  - Change to your file storage URL

- [ ] **Configure SSL/TLS** via reverse proxy (nginx, Caddy, Traefik, etc.)

---

## 9. DNS & Domains

- [ ] **Set up DNS for API domain**
  - Replaces: `api.cluster-fluster.com`
  - Point to your server deployment

- [ ] **Set up DNS for web app domain**
  - Replaces: `app.happy.engineering`
  - Point to your web app deployment
  - Must match the domain in deep link / associated domain config (Section 6)

- [ ] **Set up DNS for file storage** (multi-service only)
  - Replaces: `files.cluster-fluster.com`
  - Point to your S3/MinIO or CDN
  - Not needed if using standalone Docker (files served from server)

- [ ] **Configure SSL certificates** for all domains (Let's Encrypt, etc.)

---

## Quick Start (Standalone Docker)

For the simplest self-hosted setup, you only need to:

1. Build: `docker build -t happy-server .`
2. Run:
   ```bash
   docker run -d \
     -p 3005:3005 \
     -v happy-data:/data \
     -e HANDY_MASTER_SECRET=$(openssl rand -hex 32) \
     -e PUBLIC_URL=https://api.yourdomain.com \
     happy-server
   ```
3. Update CLI default URL in `packages/happy-cli/src/configuration.ts`
4. Update app default URL in `packages/happy-app/sources/sync/serverConfig.ts`
5. Build and distribute CLI/app

Everything else (Firebase, deep links, app stores, optional services) can be configured incrementally.
