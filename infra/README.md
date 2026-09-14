# Déploiement production

```bash
cd infra
cp .env.example .env          # puis renseigner BETTER_AUTH_URL
docker compose -f docker-compose.prod.yml up -d            # image ghcr
docker compose -f docker-compose.prod.yml up -d --build    # ou build local depuis la racine du repo
```

- UI + API : `http://<hôte>:7100`
- Moonraker : un port par imprimante à partir de `7125` (plage `7125-7140` exposée, soit 16 imprimantes)
- Données persistantes (SQLite, gcodes, `.auth-secret`) : volume `kobralink-data`

## Mise à jour

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Les migrations Prisma sont appliquées automatiquement au démarrage.

## Sauvegarde

```bash
docker run --rm -v kobralink_kobralink-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/kobralink-data.tgz -C /data .
```

## Reverse proxy

Mettre `KOBRALINK_BIND=127.0.0.1` et `BETTER_AUTH_URL=https://kobralink.example.com`.
Les ports Moonraker restent joints directement par OrcaSlicer (HTTP + WebSocket), ils ne passent pas par le proxy.
