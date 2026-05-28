# Adding a new template

A template is a directory under `packages/templates/<name>/` that tent's deploy handler can run against any managed server. Tent loads templates from disk at startup (and on `tent template sync`), validates them against `TemplateManifest`, and upserts them into the `templates` table.

The four templates that ship today are good examples to copy from:

| name              | what it deploys                                      | gist                          |
| ----------------- | ---------------------------------------------------- | ----------------------------- |
| `static`          | a single-page HTML site behind nginx                 | smallest possible template    |
| `nextjs-degenff`  | a Next.js app built from a git repo                  | git clone + stock Dockerfile  |
| `wordpress`       | WordPress + MariaDB                                  | two-service docker compose    |
| `docker-compose`  | any compose stack fetched from a URL (escape hatch)  | hand the operator full power  |

## The contract

Every template directory must contain:

1. **`manifest.json`** at the root — validated against the `TemplateManifest` zod schema in `packages/shared/src/manifest.ts`. Required fields: `name`, `version` (semver), `description`. Optional: `variables`, `requires`, `ports.internal`, `healthCheckPath`.

2. **`roles/site/`** — an Ansible role. Tent's `site-deploy.yml` includes this role by name, so the entry point must be `roles/site/tasks/main.yml`.

3. **`roles/site/templates/`** (optional) — Jinja2 templates rendered by your role (most commonly `docker-compose.yml.j2`).

4. **`roles/site/files/`** (optional) — files copied verbatim by your role.

There is no global `files/` directory at the template root — everything lives inside the role so `ansible.builtin.template` and `ansible.builtin.copy` resolve paths correctly.

## What tent passes to your role

Tent invokes `ansible-playbook` with these extra-vars on every deploy:

| var               | type   | always set | meaning                                       |
| ----------------- | ------ | ---------- | --------------------------------------------- |
| `site_slug`       | string | yes        | unique id for this site (used in paths/names) |
| `site_domain`     | string | yes        | the public hostname                           |
| `site_port`       | int    | yes        | host-side TCP port to bind the container to   |
| `var_<key>`       | any    | per-var    | one per declared variable in `manifest.json`  |

Tent also exports `ANSIBLE_ROLES_PATH` so your `roles/site` resolves first, falling back to `packages/ansible/roles/` (where `common`, `docker`, `cloudflared`, etc. live if you want to compose them).

## Variable schema design

Each variable in `manifest.json` declares:

```json
{
  "type": "string | number | boolean | enum",
  "description": "...",
  "default": "...",        // optional
  "optional": false,        // can be omitted at deploy time?
  "secret": false,          // store encrypted, never display
  "values": ["a","b"],      // for enum
  "pattern": "..."          // optional regex for strings
}
```

Rules of thumb:

- **`secret: true`** for anything you don't want appearing in audit logs, server-rendered HTML, or the bot's tail. Tent encrypts these at rest with libsodium and only decrypts them in the deploy handler.
- **`optional: true`** means the operator can leave it blank — your role must handle the empty case (the `when:` guard in `nextjs-degenff` for `var_env_file_url` is the pattern).
- **No multi-line input via the web UI today.** Multi-line strings work in CLI; web is `<input>` (gets truncated at newlines). For long content (compose YAML, certificates), accept a URL and fetch at deploy time — that's what `docker-compose` does.
- **No open-ended key-value maps** in the manifest schema. If you need arbitrary env vars, accept a URL to a `.env` file (see `nextjs-degenff`'s `env_file_url`).

## DB allocation

The `requires.postgres: true` flag *does not* currently trigger per-site DB provisioning — it only ensures Postgres is installed on the host (the `roles/postgres` role is in the bootstrap playbook and runs when the flag is set). The `sites.dbName`/`sites.dbUser` columns exist for a future Phase 6 helper that mints per-site DBs, but no template uses them today.

For Phase 5, templates that need a database (`wordpress`) ship the DB inside their own docker-compose stack and persist data via a named docker volume — keeping the template self-contained.

## Ingress contract

Tent allocates a unique host-side TCP port per site (range 8000-8999) and passes it as `site_port`. Your role must arrange for *something* to listen on `127.0.0.1:{{ site_port }}` on the host. Tent's per-server cloudflared tunnel will route `https://{site_domain}` → that local port.

Most templates do this via a docker-compose `ports` entry:

```yaml
ports:
  - "127.0.0.1:{{ site_port }}:80"
```

Bind to `127.0.0.1`, not `0.0.0.0`. The tunnel is the only thing meant to reach the container.

## Health check contract

After running compose, your role should probe `http://127.0.0.1:{{ site_port }}{{ healthCheckPath }}` until it returns 2xx/3xx/404 (some apps redirect on first hit; 404 is fine if your `healthCheckPath` is `/`). Use `ansible.builtin.uri` with `retries:` and `delay:` — see any of the shipped templates.

The `healthCheckPath` declared in your manifest is a hint for future health-monitoring (Phase 6). It's not enforced today — your role decides which path to probe.

## Backup contract

**Today (Phase 5): destroy is total.** `site-destroy.yml` runs `docker compose down -v --remove-orphans` and then removes `/var/lib/tent/sites/<slug>` outright. That means:

- All containers stop and are deleted.
- **Every named volume declared in your compose is dropped** (the `-v`). For the WordPress template that includes the MariaDB volume.
- **Every host-bind directory under the site dir is wiped** when the site dir is removed. WordPress's `./wp-content` is inside the site dir.

So destroying a WordPress site (or anything with data inside `/var/lib/tent/sites/<slug>/`) is irreversible without an external backup. The web/CLI/bot all require typed confirmation to destroy, which is the only guard in place. Don't destroy a production site you can't rebuild from scratch.

**Phase 6** will add scheduled per-site backups (pg_dump / mariadb-dump / uploads tarball, replicated off-site) and templates will be expected to drop a `backup.sh` into `/var/lib/tent/backups/<slug>/`.

WordPress operators wanting backups today should `docker exec` into the db container and `mariadb-dump`, or use a plugin like UpdraftPlus pointed at off-site storage.

## Idempotency

Every role must be safe to run repeatedly on an unchanged config. Patterns:

- Use `creates:` on `command` tasks so the second run is a no-op.
- For `template` and `copy` tasks, Ansible already diffs file contents — re-runs are no-ops when nothing changed.
- For `docker compose up -d`, the daemon recreates containers only when the spec actually changed — this is naturally idempotent.
- Avoid generating one-shot random values inside the playbook (e.g., admin passwords); take them as `secret` variables so the operator owns them.

## Adding your own template

```
packages/templates/my-thing/
├── manifest.json
└── roles/
    └── site/
        ├── tasks/
        │   └── main.yml
        └── templates/         # optional Jinja2
        └── files/             # optional verbatim copies
```

After dropping it on the control plane, `tent template sync` (CLI) or restarting the worker re-reads the directory and upserts the row.
