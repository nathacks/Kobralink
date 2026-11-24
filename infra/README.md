# Production deployment

Files:

- `docker-compose.prod.yml` — runs the published image `nathacks/kobralink` from Docker Hub (recommended)
- `docker-compose.yml` — same service, plus a `build` section to build from source (`infra/Dockerfile`, context = repo root)
- `docker-compose.https.yml` — optional overlay: Caddy with an automatic HTTPS certificate (needed for MCP OAuth)
- `.env.example` — configuration template (copy to `.env`)
- `Dockerfile` (+ `Dockerfile.dockerignore`) — built and pushed to Docker Hub by the release workflow on every `v*` tag

## Docker Hub image (no clone)

```bash
mkdir kobralink && cd kobralink
curl -fsSLO https://raw.githubusercontent.com/NatHacks/Kobralink/main/infra/docker-compose.prod.yml
curl -fsSL https://raw.githubusercontent.com/NatHacks/Kobralink/main/infra/.env.example -o .env
# set BETTER_AUTH_URL in .env
docker compose -f docker-compose.prod.yml up -d
```

Pin a version with `KOBRALINK_IMAGE=nathacks/kobralink:<version>` in `.env`. Tags: `<version>`, `<major>.<minor>`, `latest`
(linux/amd64, linux/arm64).

## Build from source

```bash
cd infra
cp .env.example .env
docker compose up -d --build
```

## Runtime

- UI + API: `http://<host>:7100`
- Moonraker: one port per printer starting at `7125` (range `7125-7140` exposed, i.e. 16 printers)
- Persistent data (SQLite, gcodes, timelapses, `.auth-secret`): `kobralink-data` volume
- Healthcheck on `/api/auth/ok`, logs rotated (json-file, 3 × 10 MB)

## Update

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Prisma migrations are applied automatically at startup. The dashboard (Settings → System) also
checks GitHub releases (`KOBRALINK_UPDATE_REPO`) and can produce a backup archive of the data directory.

## Backup

```bash
docker run --rm -v kobralink_kobralink-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/kobralink-data.tgz -C /data .
```

## Reverse proxy

Set `KOBRALINK_BIND=127.0.0.1` and `BETTER_AUTH_URL=https://kobralink.example.com`.
Moonraker ports are reached directly by OrcaSlicer (HTTP + WebSocket); they do not go through the proxy.

## HTTPS with Caddy (MCP OAuth)

Needs a domain pointing to this host and ports 80 and 443 reachable from the internet. Create the first account
**before** opening the ports: the first sign-up becomes the owner.

```bash
curl -fsSLO https://raw.githubusercontent.com/NatHacks/Kobralink/main/infra/docker-compose.https.yml
# set KOBRALINK_DOMAIN in .env
docker compose -f docker-compose.prod.yml -f docker-compose.https.yml up -d
```

`BETTER_AUTH_URL` becomes `https://$KOBRALINK_DOMAIN`. Cookies are then HTTPS-only: sign in through the domain, the
dashboard login no longer works on `http://<ip>:7100` (MCP API keys and Moonraker ports still do). Only forward ports
80 and 443 on your router, never 7100 or the Moonraker ports.
