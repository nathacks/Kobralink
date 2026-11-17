# CLAUDE.md

Guide for agents (and humans) working on FarolPrint: a bridge that makes Anycubic Kobra printers in LAN mode
(Kobra X, Kobra 4) look like Moonraker printers, with a web dashboard, OrcaSlicer support, Spoolman, camera,
AI failure detection, notifications and Home Assistant discovery.

This is the community fork of [NatHacks/Kobralink](https://github.com/NatHacks/Kobralink). Read the
[README](README.md) for the product, [docs/decisions.md](docs/decisions.md) for what was decided and why, and
[docs/development.md](docs/development.md) for how to work on it.

## How we work

- **Decisions are made by consensus with the maintainer.** Raise questions and trade-offs instead of deciding alone;
  record what was agreed in [docs/decisions.md](docs/decisions.md) (and the README when users see it).
- **Tests are not optional, for anything.** Every change ships with tests that run in CI, and they cover every
  case the change introduces, not just the happy path: each service method, each endpoint, each schema, each
  component state and each migration. A feature without its tests is not done; write them in the same change, never
  "later". When a layer has no test harness yet, build it (see [docs/development.md](docs/development.md)). Run
  `bun run lint`, `bun run check-types` and `bun run test` before saying something is done.
- **Never commit or push** unless the maintainer asks.
- **Docs follow the code**: a change that users or contributors notice updates the guide in `docs/` it touches.
- **Everything is in English**: code, docs, commits, issues and PRs. UI strings go through i18n (seven locales).
- **Commits and PR titles follow Conventional Commits** ([CONTRIBUTING.md](CONTRIBUTING.md)); PRs are squash-merged.

## Principles

1. **No firmware change.** FarolPrint only speaks the printer's own LAN protocol; it never modifies the printer.
2. **Printers without an ACE are first-class.** The external spool is a slot like any other for filament tracking.
3. **Never invent printer data.** Unknown fields stay empty; behavior is derived from what the printer reports.
4. **One printer failing never breaks the rest.** Each printer has its own bridge, MQTT session and Moonraker port.
5. **Small first.** When in doubt, leave it out and put it on the roadmap.

## Layout (Turborepo + Bun workspaces)

- `apps/api`: NestJS 11 (CJS, `module: NodeNext`), Prisma 7 + `@prisma/adapter-libsql` (dev and Docker run
  `bun src/main.ts`), Better Auth via
  `@thallesp/nestjs-better-auth`. Do not use `Bun.*` APIs in the API. The Prisma client is generated in
  `src/generated/prisma` (gitignored, `prisma generate` before `tsc`). Migrations are applied at boot by
  `src/prisma/migrator.ts`.
- `apps/web`: Vite + React 19, file-based TanStack Router (`src/routes`, `routeTree.gen.ts` gitignored), TanStack
  Query, TanStack Store (`src/stores`), Tailwind v4, shadcn (`src/components/ui`, excluded from Biome). Light and dark
  themes follow the device, with a System / Light / Dark choice per browser (`src/stores/theme.ts`, applied before
  paint by an inline script in `index.html`); every colour goes through the CSS tokens in `src/styles.css` so both
  themes work. Primary = pastel periwinkle (`bg-primary`); brand-coloured text and icons use `text-primary-strong`, a
  deeper shade in the light theme. Outfit font. Design: labelled collapsible sidebar on the left (bottom bar on
  phones), rounded cards, the print card is accented while printing. The redesign in progress is in
  [docs/roadmap.md](docs/roadmap.md).
  `bun run --filter @farolprint/web generate` = `tsr generate` + Paraglide compile (`src/paraglide`, gitignored); run
  by `check-types`.
- `packages/shared`: Zod schemas and types shared by the API and the web (`control.ts`, `state.ts`, `macros.ts`,
  `sse.ts`…). Every `/api/v1` body has its schema here, validated in the API by `ZodPipe` and typed in the web in
  `src/lib/api.ts`.
- `packages/kobra-protocol`: Kobra MQTT client (`mqtt-client.ts`), payload types, G-code parsing, upload.
- `packages/i18n`: inlang/Paraglide project, `messages/{fr,en,de,es,it,zh-cn,pt-br}.json` (base `fr`). The locale list is
  duplicated in `APP_LOCALES` (`packages/shared/src/settings.ts`); adding a language = the `/add-locale` skill. The
  package compiles its own runtime and messages for the API; the web recompiles the same messages in
  `apps/web/src/paraglide`. Its `check-types` waits for its own `build` (`packages/i18n/turbo.json`): both compile
  into `src/paraglide`, and running them in parallel made the build bundle a half-written runtime in CI.
- The three packages build with tsdown, ESM + CJS output. Packages must be built before `dev`/`check-types`/`test` of
  the apps (turbo `^build`).
- `infra/`: `Dockerfile` (+ `Dockerfile.dockerignore`), `docker-compose.yml`, `docker-compose.prod.yml`,
  `.env.example`. No Dockerfile at the root.
- `.github/workflows`: `ci.yml` (lint, types, tests, web build, Docker build), `commits.yml` (Conventional Commits),
  `docker-image.yml` (image to GHCR on every push to `main`) and `release-please.yml` (release PR, tag, versioned
  image).

## Architecture

- One `PrinterBridge` (`apps/api/src/bridge/printer-bridge.ts`) per printer: MQTT session, live state (`LiveState` from
  `@farolprint/shared`), poll loop, commands. `BridgeRegistry` creates them from the `printer` table.
- Each printer has **its own Nest application** for Moonraker on `httpPort` (`moonraker.host.ts` →
  `MoonrakerAppModule.forPrinter`). No auth on it, on purpose. `moonraker.service.ts` maps `LiveState` to Klipper
  objects (`gcode_move.speed_factor` = mapping 1→0.5/2→1.0/3→1.3/4→1.5, `motion_report.live_velocity` always 0).
  `execGcodeScript` only interprets a small subset (PAUSE/RESUME/CANCEL, M104/M140, SET_HEATER_TEMPERATURE, a
  FarolPrint macro name); everything else returns `ok` with no effect.
- The main API (:7100): `/api/auth/*` (Better Auth), `/api/v1/*` (protected), serves `apps/web/dist`. One Nest module
  per domain (`printers`, `core` = control, `filament`/`spools`/`spoolman`, `queue`, `macros`, `timelapse`,
  `detection`, `notifications`, `ha` = Home Assistant MQTT discovery, `stats`, `system`, `users`, `settings`,
  `schedule` = scheduled prints, `maintenance` = preventive maintenance tasks, `automations` = automation rules).
- Live UI state: SSE `/api/v1/printers/:id/events` → `usePrinterEvents` writes into the Query cache; `patchLiveState`
  does the local optimistic update before the MQTT confirmation.
- Print queue (`queue/queue.service.ts`): one queue for every printer (`queue_item.position` is global,
  `printerId` null = any printer, `targetTags` = printers carrying all those tags). Compatibility (`staticReasons`,
  `stockReasons`, `filamentFit` in `packages/shared/src/queue.ts` and the service) uses the G-code target read at
  upload (`gcode_file.printerModel/nozzleMm/extent*`, `metaVersion` drives the backfill). `dispatch(printerId)` starts
  the first item the printer can take (30 s cooldown, one start in flight). A print that ends sets
  `printer.awaitingBedClear` (finished ones when `queueBedClearConfirm` is on, the default; cancelled and failed ones
  always) until `POST printers/:id/queue/bed-clear` (`good`|`bad`; bad requeues the file first) or the opt-in light
  trigger (3 light reports from the printer screen within 20 s, `light_trigger` bridge event). With `queueAutoStart`,
  the next file starts `queueAutoStartDelaySec` after a dashboard confirmation (right away from the light
  trigger), or after a finished print when the confirmation is off; `GET printers/:id/queue/status` returns the countdown (`autoStartAt`) and
  `DELETE printers/:id/queue/auto-start` cancels it. `printer.maintenance` keeps a printer out. Items store the print dialog options
  (`queue_item.options`) and start with them. Scheduled prints (`schedule/`) fire a stored file at `startAt` and fall
  back to the front of the queue when the printer is busy. Maintenance tasks (`maintenance/`) are due by print
  hours, jobs or days since the last completion and notify once (`maintenance_due`).
- Costs: `stats/job-cost.ts` prices a job from the spool (or default) filament price plus `settings.costs` (energy
  per kWh × printer power, or the kWh measured by Home Assistant); there is no machine-time cost. `GET /api/v1/stats/export.csv` exports one row per job. A cancelled
  or errored job keeps the printer error code, the last camera frame (`dataDir/failures/<jobId>.jpg`) and a user
  label (`failureReason`, `note`) editable with `PATCH history/:jobId`; `POST print/cancel` takes an optional
  `reason` the bridge stores on the job when it ends. `stats/stats-metrics.ts` defines utilisation, MTBF, idle time
  after a print and estimate accuracy; `compute` also returns the previous period (`previous`) for comparisons.
- Energy: `home-assistant/` (`HaApiService` = Home Assistant REST API with `settings.homeAssistant` url + token,
  `EnergyService` reads `printerSettings.energySensor` in kWh on the bridge `job` start/end and stores
  `print_job.energyStartKwh`/`energyKwh`; `PowerService` switches `printerSettings.plugSwitch` through Home Assistant,
  falling back to the legacy `powerOnUrl`/`powerOffUrl`/`powerStatusUrl`); `jobCost` prices `energyKwh` when present,
  else the average draw.
- Macros are lists of JSON actions (`macroActionSchema` in `packages/shared/src/macros.ts`), not G-code; run by
  `macro.service.ts` through the `PrinterBridge` methods.
- Automations (`automations/automation.service.ts`, `automation_rule` table, schemas in
  `packages/shared/src/automations.ts`): rules fired by `NotificationService` events (`print_finished`,
  `print_cancelled`, `alert_spool_low`), `QueueService`'s `bed_cleared` event or a 20 s clock for `time` rules; actions
  run in order per (rule, printer) and the last error is stored on the rule. Power off waits for an idle printer and a
  nozzle under 50 °C. Notifications carry `url` (`publicUrl` + `eventLinkPath` from `packages/shared/src/events.ts`),
  sent to Discord, Telegram, ntfy and the webhook.
- Camera: `bridge/camera.ts` (`CameraCache`) = one ffmpeg per printer (FLV → MJPEG at the camera's native frame
  rate and resolution, plus the original H.264 copied as MPEG-TS), fanned out to
  `/api/v1/printers/:id/camera/{stream,snapshot}` (dashboard) and `/api/camera/{stream,snapshot}` (Moonraker,
  announced by `server/webcams/list`). Binary from `FAROLPRINT_FFMPEG`, else `@ffmpeg-installer/ffmpeg`, else `ffmpeg` from the PATH. Stops after 60 s without consumers.
- AI failure detection: `apps/api/src/detection/` (Obico YOLOv2 ONNX model, ~200 MB, downloaded on demand to
  `dataDir/models/failure-detection.onnx`, `onnxruntime-node` inference on CPU, `jpeg-js` decoding, Obico's EWM
  algorithm in `prediction.ts`). Global opt-in (`settings.failureDetection`) + a switch per printer; one frame every
  `intervalSec` while printing, `alert_print_failure` event, `notify|pause|cancel` action.
- Filament without an ACE: when `multiColorBox` reports no box, `LiveState.externalSpoolOnly` is set, usage from
  `print/report` (`supplies_usage`) is attributed to slot 0, and the filament card shows an external spool slot.
  Changing the mapped spool reports pending usage to the previous spool first.
- i18n: UI in fr, en, de, es, it, zh-cn, pt-br. Every visible string goes through `m.xxx()` (Paraglide). Web:
  `import { m } from '@/lib/i18n'` (locale kept in localStorage, dayjs in sync); API: `import { m } from
  '../i18n/locale'` (locale per request through `AsyncLocalStorage`, read from `Accept-Language`, fallback `en`).
  Adding a key = adding it to **every** `messages/*.json`.

## Commands

`bun run dev` · `bun run dev:web` (API + web, TUI) · `bun run build` · `bun run check-types`
· `bun run test` · `bun run lint` (biome check) · `bun run format` · `bun run db:migrate` (prisma migrate dev)
· `bun run db:generate` · `bun run db:studio` · `bun run version:set <x.y.z|major|minor|patch>` (bumps every
package.json; releases do it through release-please).

Tests use `bun test`: `packages/shared/test`, `packages/kobra-protocol/test`, `packages/i18n/test` (locale parity) and
`apps/api/test` (`test/helpers/db.ts` gives a real SQLite database with the migrations applied; `bunfig.toml` preloads a
temporary data dir). One file:
`cd apps/api && bun test test/spool-usage.test.ts` (or `bun test -t "test name"`). Husky hooks: pre-commit runs
`biome check --write` on staged files (4 spaces, width 120), commit-msg checks Conventional Commits, pre-push runs lint
and type-check.

No pnpm/npm: the lockfile is `bun.lock`, workspace scripts run through `bun run --filter <pkg> <script>`. Every
package.json script calls `bun`/`bunx` explicitly (Vite runs under `bunx --bun vite`).

## Rules that are easy to break

- **No comments in the code** (explicit request of the original author, kept in this fork).
- The certificates in `apps/api/certs/*` (Anycubic Slicer client certificate) are third-party material: do not modify
  them. They ship as is in the repo, and the Docker image so users have nothing to provide; they
  cannot be generated (the printer's MQTT broker checks this exact certificate).
- **Never put real printer data in fixtures**: MQTT username/password, device ID, `/info` token, serial numbers and
  public IPs are anonymized first.
- **A printer allows a single MQTT session.** A second client (a test script, another bridge) is refused while
  FarolPrint is connected.
