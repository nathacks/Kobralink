# Production deployment

Files: `Dockerfile` (+ `Dockerfile.dockerignore`), `docker-compose.yml`, `.env.example`. The image is built and pushed to Docker Hub by the release workflow on every `v*` tag.

```bash
cd infra
cp .env.example .env          # then set BETTER_AUTH_URL
docker compose up -d            # Docker Hub image (nathacks/kobralink)
docker compose up -d --build    # or local build from infra/Dockerfile (context = repo root)
```

- UI + API: `http://<host>:7100`
- Moonraker: one port per printer starting at `7125` (range `7125-7140` exposed, i.e. 16 printers)
- Persistent data (SQLite, gcodes, timelapses, `.auth-secret`): `kobralink-data` volume
- Healthcheck on `/api/auth/ok`, logs rotated (json-file, 3 × 10 MB)

## Update

```bash
docker compose pull
docker compose up -d
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
