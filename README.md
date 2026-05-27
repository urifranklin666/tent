# tent

> Self-hosted deployment framework. Stand up servers, spin up sites, sleep at night.

`tent` is a control plane for running multiple websites across multiple servers. Give it a fresh server — it'll prepare it. Give it a domain you registered — it'll spin up a site on whichever server you point it at, behind a Cloudflare Tunnel, with DNS records auto-managed.

## What it does

- **Provisions servers** on Hetzner, DigitalOcean, Vultr — or attaches a self-hosted box via SSH
- **Bootstraps any Ubuntu/Debian server** with the baseline you need: hardened users, firewall, Postgres, Docker, cloudflared, Node.js
- **Spins up sites** from a library of templates: static HTML, Next.js (the degenff pattern), WordPress, generic Docker Compose
- **Manages DNS and ingress** automatically via the Cloudflare API — no port-forwarding, no certificates to renew
- **Three ways to drive it**: CLI (`tent new-site cool.com`), a web dashboard, Discord slash commands

## Quick start

> The full installer lands at the end of Phase 1. This section is a placeholder.

```bash
# install (once)
git clone <this repo> /home/deadplug/tent
cd /home/deadplug/tent
sudo ops/install.sh

# first-time setup — generates master key, sets up Postgres, prompts for Cloudflare + Discord tokens
tent init

# add a server (provisions a fresh Hetzner box and bootstraps it)
tent server add --provider hetzner --region nbg1 --size cx21 --name barn

# add a site (DNS + tunnel + DB + app, all in one)
tent new-site coolname.com --server barn --template static
```

## Project layout

```
packages/
  core/        — shared engine (DB, providers, Cloudflare client, SSH, job queue)
  shared/      — TS types + Zod schemas shared across apps
  ansible/     — server bootstrap and per-site deploy playbooks
  templates/   — stack templates (static, nextjs-degenff, wordpress, docker-compose)
apps/
  cli/         — `tent` command-line tool
  web/         — Next.js 16 control panel
  bot/         — Discord bot
ops/
  systemd/     — unit files for web / bot / worker
  install.sh   — bootstrap script for the control plane itself
docs/
  architecture.md
  operator-guide.md   — click-by-click for non-engineers
  adding-templates.md — for AI assistants extending the framework
```

## Architecture in one paragraph

Three operator interfaces (CLI, web UI, Discord bot) all consume **one core engine** (`packages/core`) that talks to Postgres (state + job queue), the Cloudflare API (DNS + tunnels), and remote servers over SSH (driving Ansible playbooks). All long-running work runs as a queued job with progress events you can stream live in any interface. See `docs/architecture.md` for the full picture.

## Status

Under active construction. Phase progress lives in `PLAN.md` and in the project task list.
