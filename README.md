# Kobralink

Kobralink turns an **Anycubic Kobra X** into a **Moonraker-compatible printer** — no Klipper, no
Raspberry Pi, no firmware change. Run it on a small server (Docker) or as a desktop app, add your
printer by IP, then use it from **OrcaSlicer**, a **web dashboard** or any Moonraker client
(Mainsail, Obico, Home Assistant…).

## What you get

- **Multi-printer**: add a printer with its IP only, credentials are recovered automatically
- **Live state**: temperatures, fans, light, speed, progress, pause / resume / cancel, object skip
- **Print from anywhere**: web dashboard, OrcaSlicer (upload + print), per-printer print queue
- **GCode library**: thumbnails, estimated time, filaments, per-printer file browser
- **AMS / ACE**: slot profiles, feeding, auto-feed, drying with scheduled cycles
- **Filaments**: spool inventory + optional Spoolman sync
- **Camera** (MJPEG, shared with Moonraker clients) and **timelapses** per job
- **AI failure detection** (optional, Obico model) with notify / pause / cancel
- **Notifications**: webhook, Discord, Telegram, ntfy · **Home Assistant** MQTT discovery
- **History & stats**, **macros**, backup / restore, update check, multi-user
- UI in **French** and **English**

## Install in production (Docker Compose)

Requirements: Docker + Docker Compose, a machine on the same LAN as the printer.

```bash
git clone https://github.com/NatHacks/Kobralink.git
cd Kobralink/infra
cp .env.example .env
```

Edit `.env` and set `BETTER_AUTH_URL` to the URL you will type in the browser
(for example `http://192.168.1.50:7100`). Then:

```bash
docker compose up -d
```

- Dashboard: `http://<host>:7100` — the first account created becomes the owner
- Moonraker: one port per printer, starting at `7125` (range `7125-7140` exposed)
- Data (SQLite, GCodes, timelapses, session secret) is kept in the `kobralink-data` volume

Update:

```bash
docker compose pull && docker compose up -d
```

Behind a reverse proxy (HTTPS): set `KOBRALINK_BIND=127.0.0.1` and
`BETTER_AUTH_URL=https://kobralink.example.com`. Moonraker ports stay direct (OrcaSlicer needs HTTP + WebSocket).
More details (backup, healthcheck, local build): [`infra/README.md`](infra/README.md).

### `.env` reference

| Variable                  | Default                     | Role                                                    |
| ------------------------- | --------------------------- | ------------------------------------------------------- |
| `KOBRALINK_IMAGE`         | `nathacks/kobralink:latest` | Image to run (`docker compose up -d --build` to build)  |
| `KOBRALINK_BIND`          | `0.0.0.0`                   | Host interface (`127.0.0.1` behind a reverse proxy)     |
| `KOBRALINK_PORT`          | `7100`                      | Dashboard port on the host                              |
| `BETTER_AUTH_URL`         | —                           | **Required**: URL used by the browser                   |
| `BETTER_AUTH_SECRET`      | generated in `/data`        | Session secret (`openssl rand -base64 32`)              |
| `KOBRALINK_EXTRA_ORIGINS` | —                           | Extra allowed origins, comma-separated                  |

## Desktop app (macOS / Windows / Linux)

Download the installer from the [GitHub releases](https://github.com/NatHacks/Kobralink/releases)
(dmg, exe, AppImage / deb). The app runs the bridge locally and updates itself.

## Connect a printer

1. On the printer: Settings → **Enable LAN mode**.
2. Dashboard → **Add a printer** → enter the IP. A Moonraker port is assigned (`7125`, `7126`, …).
3. OrcaSlicer → physical printer → connection type **Moonraker** → host `http://<bridge-ip>:7125`.

Moonraker ports are **unauthenticated** (trusted LAN), like Moonraker itself. The dashboard on `:7100`
is protected by email + password.

## How it works

```
OrcaSlicer ──HTTP/WS──► :7125  (Moonraker, printer 1) ─┐
Mainsail / Obico ─────► :7126  (Moonraker, printer 2) ─┤   apps/api (single process)
Web UI / Desktop ─────► :7100  (UI + /kx API + auth)  ─┘         │ MQTT mTLS :9883
                                                                  ▼
                                                           Kobra X (LAN mode)
```

| App / package             | Role                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `apps/api`                | NestJS 11 · Prisma 7 + SQLite (libsql) · Better Auth · MQTT bridge · Moonraker emulation   |
| `apps/web`                | React 19 · Vite · TanStack Router + Query · Tailwind v4 · shadcn/ui                       |
| `apps/desktop`            | Electron — spawns the API locally, auto-update via GitHub releases                         |
| `packages/kobra-protocol` | Kobra X protocol: mTLS MQTT client, credential recovery, GCode upload / parsing           |
| `packages/shared`         | zod schemas + types shared between API and UI                                             |
| `packages/i18n`           | Paraglide (inlang) messages, `fr` + `en`                                                  |

## Development

```bash
bun install
bun run db:migrate   # creates data/kobralink.db
bun run dev          # API :7100 + Vite :5173 + Electron
bun run dev:web      # API + Vite only → http://localhost:5173

bun run build        # packages → api → web → desktop
bun run check-types
bun run test
bun run lint
bun run --filter @kobralink/desktop dist   # Electron installer for the current OS
```

API environment variables (`apps/api`):

| Variable                  | Default                               | Role                                          |
| ------------------------- | ------------------------------------- | --------------------------------------------- |
| `KOBRALINK_DATA_DIR`      | `<repo>/data`                         | SQLite, `gcodes/`, timelapses, `.auth-secret` |
| `DATABASE_URL`            | `file:<data>/kobralink.db`            | libsql connection string                      |
| `KOBRALINK_PORT`          | `7100`                                | UI + API                                      |
| `BETTER_AUTH_URL`         | `http://localhost:7100`               | Trusted origin / cookies                      |
| `BETTER_AUTH_SECRET`      | generated in `<data>/.auth-secret`    | Session secret                                |
| `KOBRALINK_WEB_DIR`       | `apps/web/dist`                       | SPA build to serve                            |
| `KOBRALINK_CERTS_DIR`     | `apps/api/certs`                      | `anycubic_slicer.crt` / `.key`                |
| `KOBRALINK_EXTRA_ORIGINS` | `http://localhost:5173,…`             | Extra origins (CORS + Better Auth)            |
| `KOBRALINK_FFMPEG`        | `@ffmpeg-installer/ffmpeg`, else PATH | ffmpeg binary for camera + timelapse          |
| `KOBRALINK_VERSION`       | `package.json` version                | Version reported by `/kx/system`              |
| `KOBRALINK_UPDATE_REPO`   | `NatHacks/Kobralink`                  | GitHub repo polled for update checks          |

Desktop: `KOBRALINK_URL` forces the bridge URL without spawning the API;
`KOBRALINK_SHOT=/x.png [KOBRALINK_SHOT_LOGIN="mail|password|/path"]` captures the window then quits.

### Releases

Pushing a `v*` tag runs `.github/workflows/release.yml`: multi-arch Docker image on Docker Hub
(`<version>`, `<major>.<minor>`, `latest`) and a GitHub release with the desktop builds for macOS
(Apple Silicon + Intel), Windows and Linux. Required secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.

## License

GPL-3.0. The `apps/api/certs/anycubic_slicer.*` certificates are third-party material included solely
for interoperability. Independent project, not affiliated with Anycubic.
