# tent — master plan

## Mission

A self-hosted control plane for deploying and operating multiple websites across multiple servers, drivable by a non-engineer through CLI, web UI, or Discord chat. Replaces the per-project bespoke deploy scripts that pile up when you run several sites.

## Locked design decisions

1. **Control plane host**: `/home/deadplug/tent` on the freed-up R630
2. **Supported targets**: self-hosted (BYO-SSH) + cloud VPS (Hetzner, DigitalOcean, Vultr)
3. **Templates day-one**: `static`, `nextjs-degenff`, `wordpress`, `docker-compose`
4. **Interfaces**: CLI, web UI, Discord bot — all built on a shared core engine
5. **Edge / DNS**: Cloudflare Tunnel + Cloudflare DNS API, always
6. **Language**: TypeScript throughout, except Ansible (YAML)
7. **State**: Postgres on the control-plane box
8. **Auth**: Discord OAuth; seed admin is the operator's Discord user ID
9. **Secrets**: encrypted at rest with libsodium; master key at `/etc/tent/master.key` (0600)
10. **Codename**: `tent`

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Operator                                                       │
│   ├── CLI  (apps/cli)         — `tent ...`                      │
│   ├── Web  (apps/web)         — Next.js, Discord OAuth          │
│   └── Bot  (apps/bot)         — discord.js slash commands       │
└──────────────────────┬──────────────────────────────────────────┘
                       │ (all consume the same library)
              ┌────────▼────────┐
              │  packages/core  │
              │  ─────────────  │
              │  ServerService  │
              │  SiteService    │
              │  TemplateService│
              │  JobService     │
              │  SecretService  │
              └───┬───────┬─────┘
                  │       │
   ┌──────────────▼──┐  ┌─▼────────────────┐
   │  Postgres       │  │  External APIs   │
   │  (state, queue) │  │  ───────────     │
   └─────────────────┘  │  Cloudflare      │
                        │  Hetzner / DO /  │
                        │  Vultr           │
                        │  SSH (any box)   │
                        └──────────────────┘
                                 │
                  ┌──────────────▼──────────────┐
                  │  Ansible (packages/ansible) │
                  │  Server bootstrap +         │
                  │  per-site deploys           │
                  └─────────────────────────────┘
                                 │
                  ┌──────────────▼──────────────┐
                  │  Managed servers            │
                  │  (Postgres + Docker +       │
                  │   cloudflared + Node)       │
                  └─────────────────────────────┘
```

## Phases

(Live status lives in the project task list — these are the contents of each phase.)

### Phase 0 — Repo scaffold

- pnpm workspace + Turborepo
- Strict TS configs
- Root README, PLAN, AGENTS, .gitignore
- Empty package skeletons: core, shared, cli, web, bot, ansible, templates
- `ops/env.example`, `ops/install.sh` stub, systemd unit templates
- `git init` + first commit

### Phase 1 — Core engine

- `packages/core/src/db/schema.ts` — Drizzle schema:
  - `servers` (id, name, provider, providerExternalId, ipv4, ipv6, status, sshUser, sshKeyId, regions, sshFingerprint, bootstrappedAt, lastSeenAt, tags)
  - `sites` (id, slug, domain, serverId, templateId, status, tunnelId, dnsRecordIds, envEncrypted, dbName, dbUser, createdAt)
  - `templates` (id, name, version, description, variables jsonb-schema, registry source)
  - `jobs` (id, kind, params, state, progress events, startedAt, finishedAt, error, createdBy)
  - `secrets` (id, key, value_encrypted, scope, createdAt, rotatedAt)
  - `users` (Discord-authed; same role enum as degenff)
  - `audit_log`
- `packages/core/src/secrets/crypto.ts` — libsodium secretbox; master key from `/etc/tent/master.key`
- `packages/core/src/cloudflare/` — zones, DNS records, tunnel routes (Cloudflare API v4)
- `packages/core/src/ssh/` — ssh2 wrapper, ed25519 key gen, host key TOFU + record
- `packages/core/src/ansible/runner.ts` — invoke `ansible-playbook` with structured stdout parsing
- `packages/core/src/jobs/` — Postgres-backed queue (`SELECT FOR UPDATE SKIP LOCKED`), worker loop, progress events with SSE-friendly shape
- `packages/core/src/providers/base.ts` — VpsProvider interface
- `packages/core/src/templates/registry.ts` — template loader

### Phase 2 — Hetzner + bootstrap + static template + CLI

- `packages/core/src/providers/hetzner.ts` — implements VpsProvider against Hetzner Cloud API
- `packages/ansible/playbooks/bootstrap.yml` — users, sshd hardening, ufw, fail2ban, unattended-upgrades, swap
- `packages/ansible/playbooks/postgres.yml`
- `packages/ansible/playbooks/docker.yml`
- `packages/ansible/playbooks/cloudflared.yml` — installs cloudflared, registers per-server tunnel
- `packages/ansible/playbooks/nodejs.yml`
- `packages/templates/static/` — minimal nginx-in-docker template + index.html
- `apps/cli/src/main.ts` — commander.js entry
- `apps/cli/src/commands/init.ts` — first-time control-plane setup
- `apps/cli/src/commands/server-*.ts` — add, list, bootstrap, destroy
- `apps/cli/src/commands/site-*.ts` — new, list, deploy, destroy
- `apps/cli/src/commands/doctor.ts`
- **Acceptance**: `tent init` → `tent server add` → `tent new-site demo.example.com` deploys a working static site

### Phase 3 — Web UI

- Next.js 16 (App Router) at `apps/web`
- Auth.js v5 with Discord provider (mirror degenff's setup)
- Routes: `/dashboard`, `/servers`, `/servers/[id]`, `/servers/new`, `/sites`, `/sites/[id]`, `/sites/new`, `/templates`, `/jobs`, `/jobs/[id]`, `/secrets`, `/settings`
- Live job log via Server-Sent Events
- Visual language: borrow degenff's industrial-brutalist palette but turned down — this is an operator tool, not a public site

### Phase 4 — Discord bot

- discord.js v14 at `apps/bot`
- Slash commands: `/tent-server-add`, `/tent-new-site`, `/tent-status`, `/tent-list`, `/tent-deploy`
- Allowlisted by user ID; defense-in-depth re-check on every interaction
- Ephemeral replies for anything touching secrets
- Live progress via interaction message edits

### Phase 5 — Remaining templates

- `packages/templates/nextjs-degenff/` — parametrized clone of the degeneratefuckface pattern
- `packages/templates/wordpress/`
- `packages/templates/docker-compose/`

### Phase 6 — Remaining providers + polish

- DigitalOcean, Vultr provider implementations
- `tent doctor` end-to-end health check
- Backup hooks (per-site pg_dump + uploads tarball, replicated off-site)
- Monitoring hooks
- `docs/operator-guide.md` — click-by-click for non-engineers
- Idempotency smoke tests

## Out of scope (for now)

- Kubernetes (overkill for ≤10 sites)
- Multi-region active-active
- Customer-facing multi-tenancy (this is single-operator)
- Service mesh, full observability stack beyond basic logs
