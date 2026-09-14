# CLAUDE.md

Kobralink = réécriture TypeScript de KX-Bridge (bridge Moonraker pour Anycubic Kobra X).
Référence Python d'origine : `/Users/nathan/Developer/Python/KX-Bridge-Release` (protocole MQTT,
payloads, comportements à reproduire).

## Layout (Turborepo + Bun workspaces)

- `apps/api` — NestJS 11 (CJS, `module: NodeNext`), Prisma 7 + `@prisma/adapter-libsql` (fonctionne
  sous Bun ET Node — Electron lance `dist/main.js` sous Node, dev/Docker tournent `bun src/main.ts`),
  Better Auth via `@thallesp/nestjs-better-auth`. Ne pas utiliser d'API `Bun.*` dans l'API. Client Prisma généré dans `src/generated/prisma`
  (gitignoré, `prisma generate` avant tsc). Migrations appliquées au boot par `src/prisma/migrator.ts`.
  `bun run --filter @kobralink/api bundle` produit `apps/api/bundle` (esbuild → `dist/server/main.js`, `@libsql/client`/`express`/`qs` externes installés dans `bundle/node_modules`, certs + migrations copiés) pour Electron.
- `apps/web` — Vite + React 19, TanStack Router **file-based** (`src/routes`, `routeTree.gen.ts`
  gitignoré), TanStack Query, Tailwind v4, shadcn (`src/components/ui`, exclu de biome). Thème
  dark uniquement (`class="dark"` fixé sur `<html>` dans `index.html`, pas de toggle).
  Primary = emerald shadcn, radius 1.5rem, police Outfit.
  Design : rail d'icônes à gauche, cartes très arrondies, carte d'impression en accent quand ça imprime.
- `apps/desktop` — electron-vite. En dev lance `apps/api/dist/main.js` ; packagé (`dist:mac`) embarque
  `apps/api/bundle` → `Resources/api` et `apps/web/dist` → `Resources/web` via `extraResources`. Mode local uniquement (pas de bridge distant).
  Version `electron` pinnée (électron-builder l'exige). `KOBRALINK_SHOT=/x.png [KOBRALINK_SHOT_LOGIN="mail|mdp|/path"] [KOBRALINK_URL=http://…]`
  capture la fenêtre puis quitte (smoke test) ; `KOBRALINK_URL` force l'URL du bridge sans spawn.
- `packages/kobra-protocol`, `packages/shared` — tsdown, sortie ESM + CJS.

## Points d'architecture

- Un `PrinterBridge` (`apps/api/src/bridge/printer-bridge.ts`) par imprimante : session MQTT,
  état live, poll loop, commandes. `BridgeRegistry` les instancie depuis la table `printer`.
- Chaque imprimante a **sa propre application Nest** Moonraker sur `httpPort`
  (`moonraker.host.ts` → `MoonrakerAppModule.forPrinter`). Pas d'auth dessus, volontairement.
- L'API principale (:7100) : `/api/auth/*` (Better Auth), `/kx/*` (protégé), sert `apps/web/dist`.
- Live state UI : SSE `/kx/printers/:id/events` → `usePrinterEvents` écrit dans le cache Query.
- Caméra : `bridge/camera.ts` (`CameraCache`) = un seul ffmpeg par imprimante (FLV → MJPEG 15 fps/640px),
  fanout vers `/kx/printers/:id/camera/{stream,snapshot}` (dashboard) et `/api/camera/{stream,snapshot}`
  (Moonraker, annoncé par `server/webcams/list`). Binaire via `KOBRALINK_FFMPEG`, sinon `@ffmpeg-installer/ffmpeg`
  (externe dans le bundle Electron), sinon `ffmpeg` du PATH. Arrêt auto après 60 s sans consommateur.
- Détection d'échec IA : `apps/api/src/detection/` (modèle ONNX Obico YOLOv2 ~200 Mo téléchargé à la demande dans
  `dataDir/models/failure-detection.onnx`, inférence `onnxruntime-node` CPU, décodage `jpeg-js`, algorithme EWM d'Obico
  dans `prediction.ts`). Opt-in global (`settings.failureDetection`) + switch par imprimante ; une image toutes les
  `intervalSec` pendant l'impression, événement `alert_print_failure`, action `notify|pause|cancel`.
  `onnxruntime-node` est externe dans le bundle Electron (binaires des autres plateformes supprimés).
- Texte UI en français. Aucun commentaire dans le code (demande explicite).

## Commandes

`bun run dev` · `bun run dev:web` · `bun run build` · `bun run check-types` · `bun run test` (bun test)
· `bun run lint` · `bun run db:migrate` (prisma migrate dev) · `bun run db:generate`.
Pas de pnpm/npm : lockfile = `bun.lock`, scripts de workspace via `bun run --filter <pkg> <script>`. Tous les scripts package.json invoquent `bun`/`bunx` explicitement (Vite tourne sous `bunx --bun vite`).

## Règles

- Ne jamais committer sans demande explicite.
- Les certificats `apps/api/certs/*` (cert client Anycubic Slicer, extraits par KX-Bridge) sont du matériel tiers :
  ne pas les modifier. Ils sont embarqués tels quels dans le repo, l'image Docker et le bundle Electron pour que
  l'utilisateur n'ait rien à fournir ; pas de génération possible (le broker MQTT de l'imprimante vérifie ce cert précis).
