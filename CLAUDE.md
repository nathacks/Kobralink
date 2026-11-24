# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Kobralink = bridge Moonraker pour Anycubic Kobra X (TypeScript).
Référence Python d'origine : `/Users/nathan/Developer/Python/KX-Bridge-Release` (protocole MQTT,
payloads, comportements à reproduire). La Kobra X n'expose que ce que son MQTT propose : pas de M220/M221 réels,
`print_speed_mode` 1–4 seulement, pas de position live (Z estimé depuis les couches).

## Layout (Turborepo + Bun workspaces)

- `apps/api` — NestJS 11 (CJS, `module: NodeNext`), Prisma 7 + `@prisma/adapter-libsql` (fonctionne
  sous Bun ET Node — Electron lance `dist/main.js` sous Node, dev/Docker tournent `bun src/main.ts`),
  Better Auth via `@thallesp/nestjs-better-auth`. Ne pas utiliser d'API `Bun.*` dans l'API. Client Prisma généré dans `src/generated/prisma`
  (gitignoré, `prisma generate` avant tsc). Migrations appliquées au boot par `src/prisma/migrator.ts`.
  `bun run --filter @kobralink/api bundle` produit `apps/api/bundle` (esbuild → `dist/server/main.js`, `@libsql/client`/`express`/`qs` externes installés dans `bundle/node_modules`, certs + migrations copiés) pour Electron.
- `apps/web` — Vite + React 19, TanStack Router **file-based** (`src/routes`, `routeTree.gen.ts`
  gitignoré), TanStack Query, TanStack Store (`src/stores`), Tailwind v4, shadcn (`src/components/ui`, exclu de biome). Thème
  dark par défaut, sélecteur système/clair/sombre (`src/stores/theme.ts`).
  Primary = emerald shadcn, radius 1.5rem, police Outfit.
  Design : sidebar à gauche repliable en rail d'icônes (barre en bas sur mobile), cartes très arrondies, carte d'impression en accent quand ça imprime.
  `bun run --filter @kobralink/web generate` = `tsr generate` + compilation Paraglide (`src/paraglide`, gitignoré) ; lancé par `check-types`.
- `apps/desktop` — electron-vite. En dev lance `apps/api/dist/main.js` ; packagé (`dist:mac`) embarque
  `apps/api/bundle` → `Resources/api` et `apps/web/dist` → `Resources/web` via `extraResources`. Mode local uniquement (pas de bridge distant).
  Version `electron` pinnée (électron-builder l'exige). `KOBRALINK_SHOT=/x.png [KOBRALINK_SHOT_LOGIN="mail|mdp|/path"] [KOBRALINK_URL=http://…]`
  capture la fenêtre puis quitte (smoke test) ; `KOBRALINK_URL` force l'URL du bridge sans spawn.
- `packages/shared` — schémas Zod + types partagés API ↔ web (`control.ts`, `state.ts`, `macros.ts`, `sse.ts`…). Tout body
  d'endpoint `/api/v1` a son schéma ici, validé côté API par `ZodPipe`, typé côté web dans `src/lib/api.ts`.
- `packages/kobra-protocol` — client MQTT Kobra X (`mqtt-client.ts`), types des payloads, parsing GCode, upload.
- `packages/i18n` — projet inlang/Paraglide, `messages/{fr,en,de,es,it,zh-cn,pt-br}.json` (base `fr`). Liste des locales dupliquée dans
  `APP_LOCALES` (`packages/shared/src/settings.ts`) ; ajouter une langue = skill `/add-locale`. Le package compile ses
  propres runtime + messages pour l'API ; le web recompile les mêmes messages dans `apps/web/src/paraglide`.
- Les trois packages : tsdown, sortie ESM + CJS. `build` des packages requis avant `dev`/`check-types`/`test` des apps (turbo `^build`).
- `infra/` — `Dockerfile` (+ `Dockerfile.dockerignore`), `docker-compose.yml`, `docker-compose.prod.yml`, `.env.example`. Pas de Dockerfile à la racine.
- `.github/workflows/release.yml` — sur tag `v*` : image Docker Hub multi-arch (`DOCKERHUB_USERNAME`/`DOCKERHUB_TOKEN`)
  + release GitHub avec les builds Electron mac/win/linux (`bun run --filter @kobralink/desktop dist -- --mac|--win|--linux`).
  macOS = arm64 + x64 dans un seul job (`KOBRALINK_BUNDLE_ARCHS=arm64,x64` fait installer les natifs libsql/ffmpeg des deux archs dans `apps/api/bundle`).

## Points d'architecture

- Un `PrinterBridge` (`apps/api/src/bridge/printer-bridge.ts`) par imprimante : session MQTT,
  état live (`LiveState` de `@kobralink/shared`), poll loop, commandes. `BridgeRegistry` les instancie depuis la table `printer`.
- Chaque imprimante a **sa propre application Nest** Moonraker sur `httpPort`
  (`moonraker.host.ts` → `MoonrakerAppModule.forPrinter`). Pas d'auth dessus, volontairement.
  `moonraker.service.ts` traduit `LiveState` en objets Klipper (`gcode_move.speed_factor` = mapping 1→0.5/2→1.0/3→1.3/4→1.5,
  `motion_report.live_velocity` toujours 0). `execGcodeScript` n'interprète qu'un petit sous-ensemble
  (PAUSE/RESUME/CANCEL, M104/M140, SET_HEATER_TEMPERATURE, nom de macro Kobralink) ; tout le reste renvoie `ok` sans effet.
- L'API principale (:7100) : `/api/auth/*` (Better Auth), `/api/v1/*` (protégé), sert `apps/web/dist`.
  Un module Nest par domaine (`printers`, `core` = contrôle, `filament`/`spools`/`spoolman`, `queue`, `macros`, `timelapse`,
  `detection`, `notifications`, `ha` = discovery MQTT Home Assistant, `home-assistant` = API HA (énergie, prise), `maintenance`,
  `automations`, `schedule`, `stats`, `system`, `users`, `settings`).
- Live state UI : SSE `/api/v1/printers/:id/events` → `usePrinterEvents` écrit dans le cache Query ;
  `patchLiveState` fait l'optimistic update local avant confirmation MQTT.
- Macros = liste d'actions JSON (`macroActionSchema` dans `packages/shared/src/macros.ts`), pas du GCode ;
  exécutées par `macro.service.ts` via les méthodes du `PrinterBridge`.
- Caméra : `bridge/camera.ts` (`CameraCache`) = un seul ffmpeg par imprimante (FLV → MJPEG résolution et fréquence natives),
  fanout vers `/api/v1/printers/:id/camera/{stream,snapshot}` (dashboard) et `/api/camera/{stream,snapshot}`
  (Moonraker, annoncé par `server/webcams/list`). Binaire via `KOBRALINK_FFMPEG`, sinon `@ffmpeg-installer/ffmpeg`
  (externe dans le bundle Electron), sinon `ffmpeg` du PATH. Arrêt auto après 60 s sans consommateur, sauf
  `settings.cameraAlwaysOn` (activé par défaut, par imprimante).
- Détection d'échec IA : `apps/api/src/detection/` (modèle ONNX Obico YOLOv2 ~200 Mo téléchargé à la demande dans
  `dataDir/models/failure-detection.onnx`, inférence `onnxruntime-node` CPU, décodage `jpeg-js`, algorithme EWM d'Obico
  dans `prediction.ts`). Opt-in global (`settings.failureDetection`) + switch par imprimante ; une image toutes les
  `intervalSec` pendant l'impression, événement `alert_print_failure`, action `notify|pause|cancel`.
  `onnxruntime-node` est externe dans le bundle Electron (binaires des autres plateformes supprimés).
- Serveur MCP : `apps/api/src/mcp/` sur `POST /api/mcp` (SDK `@modelcontextprotocol/server` v2), réglage
  `mcpEnabled` (off par défaut, admin). Deux auth : clés API `configId: 'mcp'` (préfixe `kl_mcp_`, `metadata.access`, jamais
  acceptées par Moonraker) et OAuth 2.1 (`@better-auth/mcp` + `jwt`, seulement si `BETTER_AUTH_URL` est en HTTPS ou localhost ;
  DCR ouvert, consentement sur `/oauth/consent`, tables `oauth_*`). `mcp-read.tools.ts` (20) et `mcp-control.tools.ts` (36) ;
  les verrous « imprimante occupée » et `bedIsClear` sont imposés ici car l'API REST ne les a pas. Les réponses passent par
  `toToolJson` (retire caméra, IP, identifiants, miniatures). Autorisations par outil : `settings.mcpTools`
  (`allow|ask|deny`, défaut `ask` si `destructive`), appliquées dans `McpService.call` ; `ask` = question oui/non dans le chat par
  elicitation (`inputRequired`, `requestState` signé lié à l'appel, texte dans `mcp-question.service.ts`), refus si le client ne sait
  pas demander ; rien à valider dans le dashboard. Protocole 2026 sans session, clients 2025 = une session en mémoire par
  `initialize` (max 50, liée à la clé). Tout nouvel outil = l'ajouter à
  `MCP_TOOL_NAMES` (shared), une clé `mcp_tool_<nom>` dans les 7 langues et les compteurs de `mcp-http.test.ts`.
- i18n : UI en fr, en, de, es, it, zh-cn, pt-br. Toute chaîne visible passe par `m.xxx()` (Paraglide) — web : `import { m } from '@/lib/i18n'`
  (locale persistée en localStorage, dayjs synchronisé) ; API : `import { m } from '../i18n/locale'` (locale par requête via
  `AsyncLocalStorage`, lue dans `Accept-Language`, fallback `en`). Ajouter une clé = l'ajouter dans **tous** les `messages/*.json`.
- Aucun commentaire dans le code (demande explicite).

## Commandes

`bun run dev` · `bun run dev:web` (api + web seulement) · `bun run dev:desktop` · `bun run build` · `bun run check-types`
· `bun run test` · `bun run lint` (biome check) · `bun run format` · `bun run db:migrate` (prisma migrate dev)
· `bun run db:generate` · `bun run db:studio` · `bun run version:set <x.y.z|major|minor|patch>` (bump tous les package.json).

Tests = `bun test`, fichiers dans `apps/api/test/*.test.ts` et `packages/*/test/*.test.ts` ; web = Vitest + Testing Library (`apps/web/src/**/*.test.{ts,tsx}`).
Un seul fichier : `cd apps/api && bun test test/detection.test.ts` (ou `bun test -t "nom du test"`).
Hook husky pre-commit : `biome check --write` sur les fichiers stagés (biome : 4 espaces, largeur 120).

Pas de pnpm/npm : lockfile = `bun.lock`, scripts de workspace via `bun run --filter <pkg> <script>`. Tous les scripts package.json invoquent `bun`/`bunx` explicitement (Vite tourne sous `bunx --bun vite`).

## Règles

- Ne jamais committer sans demande explicite.
- Les certificats `apps/api/certs/*` (cert client Anycubic Slicer) sont du matériel tiers :
  ne pas les modifier. Ils sont embarqués tels quels dans le repo, l'image Docker et le bundle Electron pour que
  l'utilisateur n'ait rien à fournir ; pas de génération possible (le broker MQTT de l'imprimante vérifie ce cert précis).
