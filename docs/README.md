# FarolPrint documentation

FarolPrint makes an Anycubic Kobra printer in LAN mode (Kobra X, Kobra 4) look like a Moonraker printer. You add the
printer by its IP address and then use it from OrcaSlicer, the web dashboard or any Moonraker client, with Spoolman,
camera, AI failure detection, notifications and Home Assistant. It never changes the printer's firmware.

## Start here

| Guide | What it covers |
|---|---|
| [README](../README.md) | What you get, installing with Docker, connecting a printer and OrcaSlicer |
| [Testing FarolPrint](testing.md) | Trying FarolPrint with your printer and reporting what you find |

## For developers

| Guide | What it covers |
|---|---|
| [Development](development.md) | Setup, commands, tests, CI, commits and releases |
| [Decisions](decisions.md) | What was decided, and why |
| [Printer protocol](protocol.md) | The Kobra LAN protocol, what FarolPrint uses of it and where it differs from Anycubic's client |
| [Contributing](../CONTRIBUTING.md) | Code style, Conventional Commits, pull requests, privacy |
| [CLAUDE.md](../CLAUDE.md) | Layout, architecture and the rules that are easy to break |
| [Infra](../infra/README.md) | Docker image and compose files |

## In one minute

```bash
curl -fsSLO https://raw.githubusercontent.com/riccardoalv/farolprint/main/infra/docker-compose.prod.yml
curl -fsSL https://raw.githubusercontent.com/riccardoalv/farolprint/main/infra/.env.example -o .env
docker compose -f docker-compose.prod.yml up -d
```

Then open `http://<host>:7100`, create the first account and add the printer by its IP (LAN mode on).
