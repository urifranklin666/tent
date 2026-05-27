# Notes for AI assistants

This is **tent**, a self-hosted deployment control plane. The operator is non-technical; you are the maintainer-by-proxy. Read carefully.

## Things that will trip you up

- **Next.js 16 in `apps/web`**. Same caveats as the companion Degeneracy repo: `middleware` is renamed to `proxy` (`src/proxy.ts`), server actions need explicit `experimental.serverActions.bodySizeLimit`, `next/image` v16 patterns differ. Read `node_modules/next/dist/docs/` before adding any Next-specific code. **Heed deprecation notices.**
- **No business logic in `apps/`**. The three apps (cli, web, bot) are thin shells over `packages/core`. If you find yourself reaching for a Cloudflare API call inside `apps/cli`, you're in the wrong package — put it in `packages/core/src/cloudflare/` and call it from the CLI.
- **All mutations go through Services** (`ServerService`, `SiteService`, etc.). Services own validation, audit logging, and job dispatch.
- **All long-running operations are jobs**. Don't `await` a provision-and-bootstrap inline — enqueue a job and stream its progress.
- **Secrets are encrypted at rest**. Never write a plaintext token to the DB. Use `SecretService.set()` / `.get()`.
- **Templates are versioned**. Changing a template's variable schema is a new version; existing sites pin to the version they deployed against.
- **Two ways data flows back from a managed server**: (a) Ansible playbook stdout parsed line-by-line into job progress events; (b) `cloudflared` tunnel telemetry. Don't invent a third channel.

## Code conventions

- TypeScript strict mode, ESM, `NodeNext` modules
- Zod for validation at all I/O boundaries (CLI args, web form input, bot interaction options, external API responses)
- Drizzle for all DB access — no raw SQL except inside migrations
- Comments only when WHY is non-obvious. No commentary for obvious code.
- Workspace deps are `"workspace:*"` in `package.json`

## Conventions specific to this repo

- All package names are scoped: `@tent/core`, `@tent/cli`, `@tent/web`, `@tent/bot`, `@tent/shared`
- The CLI binary is `tent` (set via `bin` in `apps/cli/package.json`)
- The control plane DB is named `tent` and runs on the same box as the apps
- Environment file lives at `/etc/tent/env` (root:deadplug, 0640), loaded by systemd `EnvironmentFile=`
- Runtime state directory: `/var/lib/tent/` (ssh keys, ansible inventory, tmp scratch)
- Master encryption key: `/etc/tent/master.key` (0600). **Never** commit, log, or transmit this.

## Running things during development

- `pnpm dev` from repo root — runs everything in watch mode (Turborepo `dev` task)
- `pnpm -F @tent/core db:generate` — Drizzle migration from schema diff
- `pnpm -F @tent/core db:migrate` — apply migrations to local Postgres
- `pnpm -F @tent/cli build && node apps/cli/dist/main.js <cmd>` — exercise the CLI
- `pnpm -F @tent/web dev` — Next dev on port 3030

## Don'ts

- **Don't** introduce Kubernetes, Helm, ArgoCD, Nomad, or any other orchestrator. Ansible + systemd is the deliberate floor.
- **Don't** add a frontend framework outside Next.js. The web UI is Next.js + React 19 + vanilla CSS.
- **Don't** add Tailwind. Vanilla CSS only — same as the Degeneracy repo.
- **Don't** add a message broker (Redis, RabbitMQ, NATS). Postgres-backed job queue is the deliberate choice.
- **Don't** invent a fourth interface. CLI, web, bot — those are the surfaces.
