# tent — architecture

## Why this shape

Three forces drove the design:

1. **The operator is non-technical.** Every interface (CLI, web, bot) must hide complexity behind a small number of intuitive commands.
2. **Multiple sites, multiple servers, same operator.** One control plane that owns the inventory and orchestrates work — not a per-server checkbook of cron jobs and ad-hoc scripts.
3. **Already heavily invested in a stack** (Next.js + Postgres + Discord + Cloudflare Tunnel). The framework doubles down on that stack rather than introducing a parallel ecosystem.

## The three layers

```
┌──────────────────────────────────────────────────────────────┐
│  Operator interfaces           apps/cli, apps/web, apps/bot  │
│  (Thin. No business logic. Drive Services.)                  │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│  Core engine                                  packages/core  │
│  (All business logic lives here.)                            │
│                                                              │
│  Services:                                                   │
│    ServerService    — provision, attach, bootstrap, destroy  │
│    SiteService      — new, deploy, redeploy, destroy         │
│    TemplateService  — list, render, validate                 │
│    JobService       — enqueue, claim, progress, stream       │
│    SecretService    — set, get, rotate (encrypted at rest)   │
│    AuditService     — append-only log of every mutation      │
│                                                              │
│  Adapters:                                                   │
│    Providers       (Hetzner, DigitalOcean, Vultr, BYO-SSH)   │
│    Cloudflare      (zones, DNS records, tunnel routes)       │
│    SSH             (ssh2, ed25519 key mgmt, host TOFU)       │
│    Ansible runner  (drives playbooks, streams stdout)        │
│    Templates       (registry, schema, render)                │
└────────────────────────┬─────────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────────┐
│  Substrate                                                   │
│  Postgres (state + job queue) | External APIs | SSH targets  │
└──────────────────────────────────────────────────────────────┘
```

## Data flow: adding a new site

```
operator                      apps/cli                    packages/core               external
   │                             │                            │                          │
   │  tent new-site cool.com     │                            │                          │
   ├────────────────────────────►│                            │                          │
   │                             │  ask: server? template?    │                          │
   │  (interactive prompts)      │                            │                          │
   │                             │  SiteService.create({...}) │                          │
   │                             ├───────────────────────────►│                          │
   │                             │                            │  validate domain         │
   │                             │                            │  alloc db creds          │
   │                             │                            │  encrypt env             │
   │                             │                            │  insert sites row        │
   │                             │                            │  enqueue job             │
   │                             │  jobId                     │                          │
   │                             │◄───────────────────────────┤                          │
   │                             │                            │                          │
   │                             │  JobService.stream(jobId)  │                          │
   │                             ├───────────────────────────►│                          │
   │                             │                            │                          │
   │                             │   (worker picks up job)    │                          │
   │                             │                            │  CF: create DNS CNAME    │
   │                             │                            ├─────────────────────────►│
   │                             │                            │  CF: add tunnel route    │
   │                             │                            ├─────────────────────────►│
   │                             │                            │  SSH: ansible-playbook   │
   │                             │                            ├─────────────────────────►│
   │                             │                            │  site-deploy.yml         │
   │                             │  progress events           │                          │
   │  (live log)                 │◄──── SSE / interval ───────┤                          │
   │◄────────────────────────────┤                            │                          │
   │                             │                            │  health check 200        │
   │                             │                            ├─────────────────────────►│
   │                             │                            │  update sites.status=live│
   │                             │  job: succeeded            │                          │
   │  done.                      │◄───────────────────────────┤                          │
   │◄────────────────────────────┤                            │                          │
```

## Concurrency model

Long-running work (provision a VM, bootstrap a server, deploy a site) takes minutes. None of it runs in the HTTP request that initiated it. Instead:

- **A request creates a row in `jobs`** and returns the job id.
- **The worker process** (`tent-worker.service`) polls the queue with `SELECT ... FOR UPDATE SKIP LOCKED` and claims jobs by id. Concurrency is bounded by `TENT_WORKER_CONCURRENCY` (default 2).
- **Progress events** are appended to the job's `progress` jsonb array. Each event is `{ at, kind, message, data? }`.
- **Streaming**: the web UI subscribes via SSE to `/api/jobs/[id]/stream`, the CLI polls every ~500ms, the bot edits its initial interaction reply every ~2s.

## Inventory model

```
servers (1) ─────────────► (N) sites
                                │
                                ▼
                         templates (N)
```

- A **server** is anywhere we can SSH and run Ansible: a Hetzner VM, your R630 in the closet, whatever.
- A **site** is a deployed instance of a template, scoped to one server, exposed at one domain via one Cloudflare Tunnel route.
- A **template** is a recipe — a directory in `packages/templates/<name>/` with a `manifest.json` (zod-validated), a parametrized Ansible role, and any static files (Dockerfile, nginx config, etc.).

## Secret handling

- The master key is generated at install time (`openssl rand -base64 32 > /etc/tent/master.key && chmod 600`).
- libsodium `secretbox` for all secrets: per-secret 24-byte nonce, ciphertext stored alongside in the `secrets` table.
- Plaintext values **never** leave the control plane process memory. They are decrypted in-process and injected into:
  - Ansible playbook runs (via env vars passed to the subprocess; never written to inventory files)
  - The deployed site's `/etc/<site-slug>/env` file on the target server (via `mode 0600`, written through ssh in one step)
- Never logged. Never returned by the API. Web UI shows masked values with a "reveal" button that re-checks the user's role.

## Auth and authorization

- **Discord OAuth** is the only login method. Same scopes as degenff (`identify email guilds guilds.members.read`).
- **The seed admin** is whichever Discord user IDs are in `DISCORD_ADMIN_USER_IDS` at install time. They are upserted with role `admin` on first login.
- **Roles**: `admin` (everything), `operator` (everything except destroy + secret reveal), `viewer` (read-only).
- **Bot interactions** are gated by the same role table. Every button/slash command re-reads the user's role from the DB before executing the action (defense in depth — `requireRole()` helper).

## Why not Kubernetes / Helm / etc.

- ≤10 sites doesn't justify a control plane that itself needs a control plane.
- Ansible + systemd + Docker is a substrate that survives the operator falling off the planet for six months. K8s does not.
- This is intentional. Don't propose adding an orchestrator.

## Why not Terraform

- Terraform's strength is multi-cloud declarative infra at scale. We need imperative "create one VM and finish it" with progress events streamed back into a Postgres job. That's not Terraform's shape.
- The provider abstraction in `packages/core/src/providers/` does the small subset of what Terraform would do — `createServer`, `destroyServer`, `listSizes` — without the state file dance.
