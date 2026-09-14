# Kobralink

Réécriture de [KX-Bridge](https://gitea.it-drui.de/viewit/KX-Bridge-Release) en TypeScript :
un bridge **Moonraker-compatible** pour l'Anycubic **Kobra X** (mode LAN, sans Klipper ni
Raspberry Pi), pilotable depuis OrcaSlicer, une UI web et une app macOS.

| App / package               | Rôle                                                                                   |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `apps/api`                  | NestJS 11 · Prisma 7 + SQLite (libsql) · Better Auth · bridge MQTT · émulation Moonraker (HTTP + WS) |
| `apps/web`                  | React 19 · Vite · TanStack Router + Query · Tailwind v4 · shadcn/ui                     |
| `apps/desktop`              | Electron (fenêtre macOS) — lance l'API en local ou se connecte à un bridge distant        |
| `packages/kobra-protocol`   | Protocole Kobra X pur TS : client MQTT mTLS, récupération des identifiants, upload GCode, parsing GCode |
| `packages/shared`           | Schémas zod + types partagés API ⇄ UI                                                  |

## Topologie

```
OrcaSlicer ──HTTP/WS──► :7125  (Moonraker imprimante 1) ─┐
Mainsail / Obico ─────► :7126  (Moonraker imprimante 2) ─┤   apps/api (un process)
UI web / Electron ────► :7100  (UI + /kx API + Better Auth)┘          │ MQTT mTLS :9883
                                                                       ▼
                                                                Kobra X (mode LAN)
```

- **Un port Moonraker par imprimante** (7125, 7126, …) — c'est ce que l'on renseigne dans
  OrcaSlicer (type de connexion **Moonraker**, hôte `http://IP-DU-BRIDGE:7125`). Ces endpoints
  sont **sans authentification** (LAN de confiance), comme Moonraker.
- **Port 7100** : l'UI et l'API de gestion, protégées par Better Auth (email + mot de passe).
  Le premier compte créé devient le propriétaire ; l'inscription se ferme ensuite.
- Données (SQLite, GCode store, secret de session) dans `./data` (ou `KOBRALINK_DATA_DIR`,
  `~/Library/Application Support/Kobralink/data` pour l'app macOS).

## Démarrer

```bash
bun install
bun run db:migrate   # crée data/kobralink.db (prisma migrate dev)
bun run dev          # API :7100 (bun --watch) + Vite :5173 + Electron
bun run dev:web      # API + Vite seulement → http://localhost:5173
```

En dev l'API tourne sur le runtime Bun (`bun --watch src/main.ts`) et l'UI est servie par Vite
(proxy `/api` et `/kx` vers :7100). Après `bun run build`, l'API sert directement `apps/web/dist`
sur :7100 — c'est ce que charge Electron, qui lance `apps/api/dist/main.js` sous Node (runtime Electron).
Le code de l'API reste donc compatible Node + Bun ; SQLite passe par `@prisma/adapter-libsql`
(N-API, prebuilt) sur les deux.

```bash
bun run build        # packages → api (prisma generate + nest build) → web → desktop
bun run check-types
bun run test         # bun test (api, kobra-protocol)
bun run lint         # biome
```

### Docker (bridge headless)

```bash
docker compose up -d --build     # dev/local — UI http://<hôte>:7100, Moonraker :7125+
# Production : voir infra/README.md (docker-compose.prod.yml, image ghcr, volume nommé, healthcheck)
```

Renseignez `BETTER_AUTH_URL` avec l'URL réellement utilisée par le navigateur.

### Ajouter une imprimante

1. Sur l'imprimante : Réglages → **Activer le mode LAN**.
2. UI → *Ajouter une imprimante* → IP seule. Le bridge appelle `http://IP:18910/info` + `/ctrl`,
   déchiffre les identifiants MQTT (AES-128-CBC) et les stocke. Un port Moonraker libre est attribué.
3. OrcaSlicer → imprimante physique → connexion **Moonraker** → `http://IP-DU-BRIDGE:7125`.

## Variables d'environnement (`apps/api`)

| Variable                  | Défaut                         | Rôle                                           |
| ------------------------- | ------------------------------ | ---------------------------------------------- |
| `KOBRALINK_DATA_DIR`      | `<repo>/data`                  | SQLite, `gcodes/`, `.auth-secret`              |
| `KOBRALINK_PORT`          | `7100`                         | UI + API                                       |
| `BETTER_AUTH_URL`         | `http://localhost:7100`        | Origine de confiance / cookies                 |
| `BETTER_AUTH_SECRET`      | généré dans `<data>/.auth-secret` | Secret de session                           |
| `KOBRALINK_WEB_DIR`       | `apps/web/dist`                | Build SPA à servir                             |
| `KOBRALINK_CERTS_DIR`     | `apps/api/certs`               | `anycubic_slicer.crt` / `.key`                 |
| `KOBRALINK_EXTRA_ORIGINS` | `http://localhost:5173,…`      | Origines supplémentaires (CORS + Better Auth)  |

## Périmètre (phase 1)

- ✅ Multi-imprimantes, ajout par IP, identifiants auto, reconnexion MQTT robuste
- ✅ État live (SSE), températures, ventilateur, éclairage, vitesse, axes, pause/reprise/annulation
- ✅ GCode store (upload, miniature, temps estimé, filaments), historique des jobs
- ✅ Impression depuis l'UI et depuis OrcaSlicer (upload + `print=true`), mapping AMS auto
- ✅ Surface Moonraker : `/server/*`, `/printer/*`, `/websocket` JSON-RPC, `lane_data`, `mmu`, shim OctoPrint
- ⏳ Phase 2 : contrôle AMS/ACE (set slot, feed, séchage), caméra (ffmpeg MJPEG/H.264), Spoolman,
  Obico, profils OrcaSlicer personnalisés, skip d'objets, packaging Electron autonome (DMG)

## Licence

GPL-3.0 (héritée de KX-Bridge). Les certificats `apps/api/certs/anycubic_slicer.*` sont du
matériel tiers inclus uniquement à des fins d'interopérabilité — voir le NOTICE du projet original.
Projet indépendant, non affilié à Anycubic.
