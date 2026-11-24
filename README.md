<p align="center"><img src="apps/web/public/logo.svg" alt="Kobralink" width="128" /></p>

<h1 align="center">Kobralink</h1>

<p align="center">
  <a href="https://github.com/NatHacks/Kobralink/releases/latest"><img src="https://img.shields.io/github/v/release/NatHacks/Kobralink?label=release" alt="GitHub release" /></a>
  <a href="https://github.com/NatHacks/Kobralink/releases"><img src="https://img.shields.io/github/downloads/NatHacks/Kobralink/total?label=downloads" alt="GitHub downloads" /></a>
  <a href="https://hub.docker.com/r/nathacks/kobralink"><img src="https://img.shields.io/docker/pulls/nathacks/kobralink?label=docker%20pulls" alt="Docker pulls" /></a>
  <a href="https://hub.docker.com/r/nathacks/kobralink"><img src="https://img.shields.io/docker/image-size/nathacks/kobralink/latest?label=image%20size" alt="Docker image size" /></a>
  <a href="https://github.com/NatHacks/Kobralink/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/NatHacks/Kobralink/release.yml?label=release%20build" alt="Release build" /></a>
  <a href="https://github.com/NatHacks/Kobralink/stargazers"><img src="https://img.shields.io/github/stars/NatHacks/Kobralink?style=flat" alt="GitHub stars" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/NatHacks/Kobralink" alt="License" /></a>
</p>

Kobralink turns an **Anycubic Kobra X** or **Kobra 4** into a **Moonraker-compatible printer** — no Klipper, no
Raspberry Pi, no firmware change. Run it on a small server (Docker) or as a desktop app, add your
printer by IP, then use it from **OrcaSlicer**, a **web dashboard** or any Moonraker client
(Mainsail, Obico, Home Assistant…).

<p align="center"><img src="docs/interface.png" alt="Kobralink dashboard" width="900" /></p>

## What you get

- **Multi-printer**: add a printer with its IP only, credentials are recovered automatically; a setup wizard walks
  through the first run, and each printer has a profile (location, tags, nozzle, power draw)
- **Live state**: temperatures, fans, light, speed, progress, calibration steps, pause / resume / cancel (with a
  reason), object skip
- **Print from anywhere**: web dashboard, OrcaSlicer (upload + print), scheduled starts
- **One queue for every printer**: items target a printer, a tag or any compatible printer (model, nozzle, build
  volume and material; the colour is a hint), say why they wait, and are checked against the loaded filament; a
  cleared bed is rated good or bad, a printer can be put in maintenance, and an opt-in light trigger confirms the bed
  from the printer
- **GCode library**: thumbnails, estimated time, filaments and the amount each colour needs, one library for every
  printer
- **AMS / ACE**: slot profiles, feeding, auto-feed, drying with scheduled cycles
- **Filament**: Spoolman as the source of truth (prices, low-spool alerts, retried usage reports), or a simple local
  inventory; the print dialog warns when a spool is short
- **Camera** (MJPEG at native quality, shared with Moonraker clients) and **timelapses** per job
- **AI failure detection** (optional, Obico model) with notify / pause / cancel, lighting the camera while it watches
- **Automations**: rules on print end, failure, cleared bed, low filament or a time of day that run macros, switch
  the light or the smart plug, load or unload filament and notify
- **Notifications**: webhook, Discord, Telegram, ntfy, each linking to the right screen · **Home Assistant** MQTT
  discovery (sensors, controls, camera, print thumbnail), and the real energy of each print read from the plug's meter in Home Assistant
- **History & stats**: estimated cost before printing (file card, preview and print dialog), actual cost per print
  (filament and energy) on a history of cards with the preview of each print, comparison with the previous
  period, utilisation, mean time between failures, idle time and estimate accuracy per printer, failures by reason
  (Pareto) with the camera snapshot of the moment, wasted filament, CSV export
- **Prometheus metrics** at `/api/v1/metrics` (temperatures, progress, state, ACE humidity…), authenticated with an
  API key (`authorization: { credentials: kl_… }` in the scrape config; a key scoped to a printer only sees that one)
- **Preventive maintenance** per printer: tasks due by print hours, number of prints or days, with history
- **Macros**, backup / restore, update check, multi-user, light and dark themes
- UI in **French**, **English**, **German**, **Spanish**, **Italian**, **Simplified Chinese** and
  **Brazilian Portuguese**

## Install in production (Docker Compose)

Requirements: Docker + Docker Compose, a machine on the same LAN as the printer. No clone needed:
`infra/docker-compose.prod.yml` runs the published image
[`nathacks/kobralink`](https://hub.docker.com/r/nathacks/kobralink) (linux/amd64 + linux/arm64).

```bash
mkdir kobralink && cd kobralink
curl -fsSLO https://raw.githubusercontent.com/NatHacks/Kobralink/main/infra/docker-compose.prod.yml
curl -fsSL https://raw.githubusercontent.com/NatHacks/Kobralink/main/infra/.env.example -o .env
```

Edit `.env` and set `BETTER_AUTH_URL` to the URL you will type in the browser. Then:

```bash
docker compose -f docker-compose.prod.yml up -d
```

- Dashboard: `http://<host>:7100` — the first account created becomes the owner
- Moonraker: one port per printer, starting at `7125` (range `7125-7140` exposed, i.e. 16 printers)
- Data (SQLite, GCodes, timelapses, session secret) is kept in the `kobralink-data` volume

Update:

```bash
docker compose -f docker-compose.prod.yml pull && docker compose -f docker-compose.prod.yml up -d
```

To pin a version, set `KOBRALINK_IMAGE=nathacks/kobralink:<version>` in `.env`.

Behind a reverse proxy (HTTPS): set `KOBRALINK_BIND=127.0.0.1` and
`BETTER_AUTH_URL=https://kobralink.example.com`. Moonraker ports stay direct (OrcaSlicer needs HTTP + WebSocket).
More details (backup, healthcheck, local build from source): [`infra/README.md`](infra/README.md).

More than 16 printers: the app assigns ports without limit (`7125`, `7126`, … up to `65535`), but the compose
file only publishes `7125-7140`. Printer 17+ would listen inside the container without being reachable from the host.
Widen the range in `docker-compose.prod.yml` (e.g. `"${KOBRALINK_BIND:-0.0.0.0}:7125-7224:7125-7224"` for 100 printers),
or use `network_mode: host` on Linux and drop the `ports:` block entirely (then `KOBRALINK_BIND` no longer applies and
every port listens on all interfaces).

### `.env` reference

| Variable                  | Default                     | Role                                                    |
| ------------------------- | --------------------------- | ------------------------------------------------------- |
| `KOBRALINK_IMAGE`         | `nathacks/kobralink:latest` | Image to run (pin a version: `nathacks/kobralink:0.1.5`) |
| `KOBRALINK_BIND`          | `0.0.0.0`                   | Host interface (`127.0.0.1` behind a reverse proxy)     |
| `KOBRALINK_PORT`          | `7100`                      | Dashboard port on the host                              |
| `BETTER_AUTH_URL`         | —                           | **Required**: URL used by the browser                   |
| `BETTER_AUTH_SECRET`      | generated in `/data`        | Session secret (`openssl rand -base64 32`)              |
| `KOBRALINK_EXTRA_ORIGINS` | —                           | Extra allowed origins, comma-separated                  |
| `KOBRALINK_TRUSTED_PROXIES` | —                         | Proxy IPs/CIDRs (real client IP for auth rate limiting) |
| `KOBRALINK_IP_HEADERS`    | —                           | Header set by the proxy with the client IP (`x-real-ip`, `cf-connecting-ip`) |
| `TZ`                      | `UTC`                       | Server time zone, used by time-based automations and daily statistics (`Europe/Paris`) |

## Desktop app (macOS / Windows / Linux)

Download the installer from the [GitHub releases](https://github.com/NatHacks/Kobralink/releases)
(dmg, exe, AppImage / deb). The app runs the bridge locally and updates itself.

## Connect a printer

1. On the printer: Settings → **Enable LAN mode**.
2. Dashboard → **Add a printer** → enter the IP. A Moonraker port is assigned (`7125`, `7126`, …).
3. OrcaSlicer → physical printer → connection type **Moonraker** → host `http://<bridge-ip>:7125`
   (or open **Connect OrcaSlicer** in the dashboard: it lists the exact address to paste for each printer).
   Click *Test*, then confirm: the **Device** tab now shows the printer and *Print* sends the G-code to Kobralink.

The OrcaSlicer **Device** tab only targets the printer: send a job, follow progress, pause / cancel, sync the ACE
filaments. Everything else — print queue, file library, macros, filament profiles per slot, camera, failure
detection, statistics, notifications, API keys — lives in the Kobralink dashboard on `:7100`.

With Home Assistant MQTT discovery on, the printer's camera entity shows the latest frame every few seconds while
the camera runs (it never turns the camera on by itself). For live video, add Home Assistant's **MJPEG IP Camera**
integration with `http://<bridge-ip>:7125/api/camera/stream` as the MJPEG URL and
`http://<bridge-ip>:7125/api/camera/snapshot` as the still image URL (use the printer's own Moonraker port).

By default the Moonraker ports are **unauthenticated** (trusted LAN), like Moonraker itself. The dashboard
on `:7100` is protected by email + password.

To lock the Moonraker ports, open **OrcaSlicer → API keys** in the dashboard, enable *Require an API key*
and generate a key per printer and client — a key only unlocks the printer it was created for, so pasting
it in OrcaSlicer targets that printer. Clients send it as an `X-Api-Key` header (OrcaSlicer's "API Key / Password"
field, Fluidd, Obico, Home Assistant), as `Authorization: Bearer`, or as `?api_key=` in the URL (camera `<img>`
tags). WebSocket clients can also use the standard Moonraker `/access/oneshot_token` flow. Mainsail has no
API key field and will not connect while the option is on.

Home Assistant can also read the printers through the HACS **Moonraker** integration (host = bridge IP, port =
the printer's Moonraker port), which shows the print thumbnail as a camera entity. That integration always fetches
the thumbnail on port `7125`: for the second printer onward, set its **Thumbnail Port** option (integration
options) to the printer's port (`7126`, …), otherwise it shows the first printer's thumbnail. The built-in MQTT
discovery has no such limit.

## How it works

```
OrcaSlicer ──HTTP/WS──► :7125  (Moonraker, printer 1) ─┐
Mainsail / Obico ─────► :7126  (Moonraker, printer 2) ─┤   apps/api (single process)
Web UI / Desktop ─────► :7100  (UI + /api/v1 API + auth)  ─┘         │ MQTT mTLS :9883
                                                                  ▼
                                                           Kobra X / Kobra 4 (LAN mode)
```

| App / package             | Role                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| `apps/api`                | NestJS 11 · Prisma 7 + SQLite (libsql) · Better Auth (+ API keys) · MQTT bridge · Moonraker emulation |
| `apps/web`                | React 19 · Vite · TanStack Router + Query · Tailwind v4 · shadcn/ui · Vitest              |
| `apps/desktop`            | Electron — spawns the API locally, auto-update via GitHub releases                         |
| `packages/kobra-protocol` | Kobra X protocol: mTLS MQTT client, credential recovery, GCode upload / parsing           |
| `packages/shared`         | zod schemas + types shared between API and UI                                             |
| `packages/i18n`           | Paraglide (inlang) messages: `fr`, `en`, `de`, `es`, `it`, `zh-cn`, `pt-br`               |

## Development

```bash
bun install
bun run db:migrate   # creates data/kobralink.db
bun run dev          # API :7100 + Vite :5454 + Electron
bun run dev:web      # API + Vite only → http://localhost:5454

bun run build        # packages → api → web → desktop
bun run check-types
bun run test
bun run lint
bun run --filter @kobralink/desktop dist   # Electron installer for the current OS
```

No printer at hand? `bun run --filter @kobralink/api fake-printer` emulates a Kobra 4 with an ACE in the middle of a
print (temperatures, camera test pattern, filament, files, pause / resume / cancel) on `127.0.0.1`: add a printer with
that IP in the dashboard. It is dev-only and never shipped.

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
| `KOBRALINK_EXTRA_ORIGINS` | `http://localhost:5454,…`             | Extra origins (CORS + Better Auth)            |
| `KOBRALINK_FFMPEG`        | `@ffmpeg-installer/ffmpeg`, else PATH | ffmpeg binary for camera + timelapse          |
| `KOBRALINK_VERSION`       | `package.json` version                | Version reported by `/api/v1/system`              |
| `KOBRALINK_UPDATE_REPO`   | `NatHacks/Kobralink`                  | GitHub repo polled for update checks          |

Desktop: `KOBRALINK_URL` forces the bridge URL without spawning the API;
`KOBRALINK_SHOT=/x.png [KOBRALINK_SHOT_LOGIN="mail|password|/path"]` captures the window then quits.

### Releases

Pushing a `v*` tag runs `.github/workflows/release.yml`: multi-arch Docker image on Docker Hub
(`<version>`, `<major>.<minor>`, `latest`) and a GitHub release with the desktop builds for macOS
(Apple Silicon + Intel), Windows and Linux. Required secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`.

Without an Apple certificate the macOS app is ad-hoc signed (`apps/desktop/scripts/after-sign.cjs`); Gatekeeper
shows "unidentified developer" — right-click → Open, or `xattr -dr com.apple.quarantine /Applications/Kobralink.app`.
To sign and notarize, add the secrets `CSC_LINK` (base64 `.p12`), `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

## License

GPL-3.0. The `apps/api/certs/anycubic_slicer.*` certificates are third-party material included solely
for interoperability. They expire in 2123 (100 years), so no rotation is needed; they only have to be
replaced if an Anycubic firmware or slicer update ships a new certificate. If the MQTT TLS handshake is
refused by the printer, an outdated certificate is a likely cause. To pull a fresh pair from an Anycubic
Slicer Next install (`cloud_mqtt.dll` or the whole install directory), run
`bun run certs:extract <path> [--out apps/api/certs] [--force]`. Independent project, not affiliated
with Anycubic.
