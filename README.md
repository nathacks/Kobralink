# Kobralink

TypeScript rewrite of [KX-Bridge](https://gitea.it-drui.de/viewit/KX-Bridge-Release): a
**Moonraker-compatible bridge** for the Anycubic **Kobra X** (LAN mode, no Klipper, no Raspberry Pi),
usable from OrcaSlicer, a web dashboard and a macOS app.

| App / package             | Role                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `apps/api`                | NestJS 11 · Prisma 7 + SQLite (libsql) · Better Auth · MQTT bridge · Moonraker emulation (HTTP + WS)         |
| `apps/web`                | React 19 · Vite · TanStack Router + Query · Tailwind v4 · shadcn/ui                                          |
| `apps/desktop`            | Electron (macOS window) — spawns the API locally, auto-update via GitHub releases                             |
| `packages/kobra-protocol` | Pure-TS Kobra X protocol: mTLS MQTT client, credential recovery, GCode upload, GCode parsing                 |
| `packages/shared`         | zod schemas + types shared between API and UI                                                                |
| `packages/i18n`           | Paraglide (inlang) messages, `fr` + `en`, consumed by API, web and desktop                                   |

## Topology

```
OrcaSlicer ──HTTP/WS──► :7125  (Moonraker, printer 1) ─┐
Mainsail / Obico ─────► :7126  (Moonraker, printer 2) ─┤   apps/api (single process)
Web UI / Electron ────► :7100  (UI + /kx API + Better Auth)┘         │ MQTT mTLS :9883
                                                                      ▼
                                                               Kobra X (LAN mode)
```

- **One Moonraker port per printer** (7125, 7126, …) — this is what you enter in OrcaSlicer
  (connection type **Moonraker**, host `http://BRIDGE-IP:7125`). These endpoints are
  **unauthenticated** (trusted LAN), like Moonraker itself.
- **Port 7100**: dashboard and management API, protected by Better Auth (email + password).
  The first account created becomes the owner; sign-up closes afterwards. Extra users can be
  managed from the settings.
- Data (SQLite, GCode store, timelapses, session secret) lives in `./data` (or `KOBRALINK_DATA_DIR`,
  `~/Library/Application Support/Kobralink/data` for the macOS app).

## Getting started

```bash
bun install
bun run db:migrate   # creates data/kobralink.db (prisma migrate dev)
bun run dev          # API :7100 (bun --watch) + Vite :5173 + Electron
bun run dev:web      # API + Vite only → http://localhost:5173
```

In dev the API runs on Bun (`bun --watch src/main.ts`) and the UI is served by Vite (proxying `/api`
and `/kx` to :7100). After `bun run build`, the API serves `apps/web/dist` directly on :7100 — this is
what Electron loads, running `apps/api/dist/main.js` under Node (Electron runtime). The API code therefore
stays Node + Bun compatible; SQLite goes through `@prisma/adapter-libsql` (N-API, prebuilt) on both.
Prisma migrations are applied automatically at boot.

```bash
bun run build        # packages → api (prisma generate + nest build) → web → desktop
bun run check-types
bun run test         # bun test (api, kobra-protocol)
bun run lint         # biome
bun run --filter @kobralink/desktop dist       # bundles the API (esbuild) + web, then electron-builder for the current OS
```

### Docker (headless bridge)

```bash
cd infra && cp .env.example .env
docker compose up -d             # Docker Hub image nathacks/kobralink — UI http://<host>:7100, Moonraker :7125+
docker compose up -d --build     # or build locally from infra/Dockerfile
# Details: infra/README.md (named volume, healthcheck, reverse proxy)
```

Set `BETTER_AUTH_URL` to the URL the browser actually uses.

### Releases

Pushing a `v*` tag (e.g. `git tag v0.2.0 && git push --tags`) runs `.github/workflows/release.yml`:
multi-arch Docker image pushed to Docker Hub (`<version>`, `<major>.<minor>`, `latest`) and a GitHub
release with the Electron builds for macOS (dmg/zip, Apple Silicon + Intel), Windows (nsis) and Linux (AppImage/deb) plus the
`latest*.yml` files used by the in-app auto-updater. Required repository secrets: `DOCKERHUB_USERNAME`,
`DOCKERHUB_TOKEN`.

### Adding a printer

1. On the printer: Settings → **Enable LAN mode**.
2. UI → *Add a printer* → IP only. The bridge calls `http://IP:18910/info` + `/ctrl`, decrypts the
   MQTT credentials (AES-128-CBC) and stores them. A free Moonraker port is assigned.
3. OrcaSlicer → physical printer → **Moonraker** connection → `http://BRIDGE-IP:7125`.

## Environment variables (`apps/api`)

| Variable                  | Default                              | Role                                              |
| ------------------------- | ------------------------------------ | ------------------------------------------------- |
| `KOBRALINK_DATA_DIR`      | `<repo>/data`                        | SQLite, `gcodes/`, timelapses, `.auth-secret`     |
| `DATABASE_URL`            | `file:<data>/kobralink.db`           | libsql connection string                          |
| `KOBRALINK_PORT`          | `7100`                               | UI + API                                          |
| `BETTER_AUTH_URL`         | `http://localhost:7100`              | Trusted origin / cookies                          |
| `BETTER_AUTH_SECRET`      | generated in `<data>/.auth-secret`   | Session secret                                    |
| `KOBRALINK_WEB_DIR`       | `apps/web/dist`                      | SPA build to serve                                |
| `KOBRALINK_CERTS_DIR`     | `apps/api/certs`                     | `anycubic_slicer.crt` / `.key`                    |
| `KOBRALINK_EXTRA_ORIGINS` | `http://localhost:5173,…`            | Extra origins (CORS + Better Auth)                |
| `KOBRALINK_FFMPEG`        | `@ffmpeg-installer/ffmpeg`, else PATH | ffmpeg binary for camera + timelapse             |
| `KOBRALINK_VERSION`       | `package.json` version               | Version reported by `/kx/system`                  |
| `KOBRALINK_UPDATE_REPO`   | `NatHacks/Kobralink`                 | GitHub repo polled for update checks              |

Desktop (`apps/desktop`): `KOBRALINK_URL` forces the bridge URL without spawning the API;
`KOBRALINK_SHOT=/x.png [KOBRALINK_SHOT_LOGIN="mail|password|/path"]` captures the window then quits (smoke test).

## Features

- **Printers**: multi-printer, add by IP, automatic credentials, robust MQTT reconnection
- **Live state** (SSE): temperatures, fan, light, speed, axes, pause/resume/cancel, object skip
- **GCode store**: upload, thumbnail, estimated time, filaments, verification, per-printer file browser
- **Printing** from the UI, from OrcaSlicer (upload + `print=true`) and from a per-printer **queue**;
  automatic AMS mapping
- **AMS / ACE**: slot profiles, feed, auto-feed, drying with scheduled dry cycles
- **Filaments**: local spool inventory + optional **Spoolman** sync
- **Camera**: one ffmpeg per printer (FLV → MJPEG, plus H.264 passthrough), shared between dashboard
  and Moonraker (`server/webcams/list`), auto-stop after 60 s without consumers
- **Timelapses**: recorded per job, browsable with poster + video
- **History & stats**: job history, print statistics
- **Macros**: user-defined GCode macros, runnable per printer
- **Notifications**: webhook, Discord, Telegram, ntfy on job events
- **Home Assistant**: MQTT discovery + command topics
- **System**: update check, backup/restore of the data directory, restart, user management
- **i18n**: French and English UI (Paraglide)
- **Moonraker surface**: `/server/*`, `/printer/*`, `/websocket` JSON-RPC, `lane_data`, `mmu`,
  OctoPrint shim (`/api/version`, `/api/files/local`)

## License

GPL-3.0 (inherited from KX-Bridge). The `apps/api/certs/anycubic_slicer.*` certificates are third-party
material included solely for interoperability — see the original project's NOTICE.
Independent project, not affiliated with Anycubic.
