# Operator guide

Click-by-click for running tent. Assumes you've already done [first-time setup](#first-time-setup); everything else is "do the same thing through whichever surface you're at."

## Glossary

- **Control plane** — the host running tent (the R630). It does not host sites itself; it orchestrates *other* servers.
- **Server** — a managed host (cloud VPS or your own box) on which tent deploys sites. Each gets its own per-server cloudflared tunnel.
- **Site** — one public hostname deployed onto exactly one server, instantiated from a **template**.
- **Template** — a directory in `packages/templates/<name>/` defining how to deploy a kind of site (`static`, `nextjs-degenff`, `wordpress`, `docker-compose`).
- **Job** — anything that takes more than a request-response: provisioning a VM, running ansible, deploying a site. Lives in the Postgres `jobs` table; the worker daemon claims and runs them.
- **Tunnel** — a per-server cloudflared connection between Cloudflare's edge and the server. tent adds an ingress rule per site to route `domain → localhost:<port>`.

## First-time setup

On the box that will be the control plane:

```bash
sudo ./ops/install.sh
```

This installs postgres, docker, ansible, cloudflared, node 20, pnpm, and writes `/etc/tent/env` from `ops/env.example`. **Then it exits and asks you to fill the env file in.** Open it as root:

```bash
sudoedit /etc/tent/env
```

Required values:

- `TENT_DATABASE_URL` — already populated for the local postgres tent role.
- `TENT_PUBLIC_HOST` — the hostname you'll reach the web UI at.
- `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` — token needs `Zone:DNS:Edit` on every zone you'll deploy onto, plus `Account:Cloudflare Tunnel:Edit` and `Account:Account Settings:Read`.
- `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET` — Discord OAuth app for web sign-in.
- `DISCORD_ADMIN_USER_IDS` — comma-separated Discord user IDs allowed to sign in. **You must be on this list or nobody can log in.**
- `AUTH_SECRET` — `openssl rand -base64 32`.

Optional but useful:

- `HETZNER_API_TOKEN` / `DIGITALOCEAN_API_TOKEN` / `VULTR_API_KEY` — for cloud provisioning.
- `DISCORD_BOT_TOKEN` + `DISCORD_GUILD_ID` — to enable the Discord bot.
- `DISCORD_NOTIFY_WEBHOOK_URL` — webhook the worker pings on permanent job failures.

Then re-run `sudo ./ops/install.sh`. It picks up where it stopped, applies the initial DB migrations, installs the systemd units, and starts `tent-worker`.

Verify with:

```bash
sudo -u deadplug node ~/tent/apps/cli/dist/main.js init
sudo -u deadplug node ~/tent/apps/cli/dist/main.js doctor
```

`doctor` exits 0 if every check passes. Anything red is something to fix before continuing.

## Adding a server

### CLI

```bash
tent server add
```

Interactive picker:

1. Pick a provider — only providers whose token is set show up. `selfhosted` is always there.
2. Name it (alphanumeric + hyphens, used as the hostname).
3. **Cloud** — pick region, then size.
4. **Self-hosted** — give the IPv4 of your existing box and the SSH user. tent prints a public key you must paste into `~/.ssh/authorized_keys` on that user **before** bootstrap can run.

`tent server add` tails the bootstrap job. When it goes green, the server is ready and the per-server cloudflared tunnel is up.

### Web

`/servers/new` — same pickers as the CLI, plus you get to see regions/sizes in a dropdown driven by the live provider API. After submit, you're redirected to `/jobs/<id>` with a live SSE tail.

For self-hosted servers, the generated SSH public key shows on `/servers/<id>` once the server exists — paste it into `authorized_keys` on the box before bootstrap completes.

### Bot

```
/tent-server-add provider:hetzner name:barn region:fsn1 size:cax11
```

Same gates as CLI/web. Selfhosted gets an ephemeral follow-up message containing the public key.

## Adding a site

### CLI

```bash
tent new-site hello.example.com
```

Interactive:

1. Pick a ready server.
2. Pick a template.
3. Fill in template variables (defaults shown, secrets masked).
4. Confirm. Tails the deploy.

When it succeeds, `https://hello.example.com` is live (DNS propagation usually within seconds since Cloudflare proxies it).

### Web

`/sites/new` — same flow but with a form. The template-variable section is dynamic based on which template you picked.

### Bot

```
/tent-new-site domain:hello.example.com server:barn template:static
```

The bot uses *defaults* for every template variable (slash commands aren't a great surface for arbitrary key/value). If you need non-default vars, use CLI or web.

## Common operations

### Redeploy after code changes

For `nextjs-degenff` (and any template that pulls from git): just redeploy.

```bash
tent backup run hello.example.com   # snapshot first if you care
```

Web: `/sites/<id>` doesn't have a "redeploy" button today; use CLI or the bot's `/tent-deploy site:<slug-or-domain>`.

Bot:

```
/tent-deploy site:hello.example.com
```

### Rotate a secret

Secrets live in the `secrets` table (encrypted with the master key at `/etc/tent/master.key`). The web UI exposes the keys but never the values (`/secrets`, admin only). To rotate:

```bash
# Web: delete the key from /secrets, then add it again with the new value.
# CLI is not wired for secret management today — admins do it via web.
```

For *template* variables that are stored against a site (e.g., wordpress's `db_password`), there's no rotation UI yet — destroy the site and recreate.

### Set up a backup destination

**Today, backups are local-only on the target server.** Per-site state is tarballed into `/var/lib/tent/backups/<slug>/<timestamp>.tar.gz`. The last 7 are kept by default. Off-site replication is the next thing to land — until then, scrape the directory yourself (rclone, rsync, restic) if you want a remote copy.

To take a backup now:

```bash
tent backup run hello.example.com
```

The job runs the template's `backup.sh` (if it has one — wordpress does, dumps mariadb; static and docker-compose templates just tar the site dir), then writes the tarball.

### Destroying a site (recovery story)

**Destroy is total. There is no automated recovery.** All three surfaces require typed confirmation:

- CLI: prompts.
- Web: `/sites/<id>` — type the full domain to enable the destroy button.
- Bot: not exposed. Use web or CLI.

What destroy does: removes the Cloudflare DNS record, removes the tunnel ingress rule, then SSHes to the server and runs `docker compose down -v --remove-orphans` followed by `rm -rf /var/lib/tent/sites/<slug>`. **Named volumes get removed.** WordPress's mariadb data goes with it. WordPress's `wp-content` bind dir goes with it.

If you want to keep the data, run `tent backup run <site>` first and the tarball will live at `/var/lib/tent/backups/<slug>/` *on the target server*. The site dir is removed but the backups dir is not.

To recover: re-create the site with the same slug, then untar the backup over `/var/lib/tent/sites/<slug>` and `docker compose up`. There's no first-class restore command yet.

### Destroying a server

Web: `/servers/<id>` — type the server name to enable the button. CLI: `tent server destroy <name>`. Bot: not exposed.

Destroy:
1. Deletes the Cloudflare tunnel.
2. For cloud providers: deletes the VM via the provider API.
3. Marks the server `destroyed` in the DB.

The server's sites are NOT auto-destroyed. They'll be orphaned. Destroy them individually first, or live with stale rows in the `sites` table.

## When something goes wrong

### `tent doctor`

Runs:

- env file loads and parses
- master key file exists, readable, 32 bytes after base64-decode
- database is reachable
- providers registered (always passes; just enumerates)
- **worker heartbeat** — fails if `/var/lib/tent/worker.heartbeat` is missing or older than 120s. If this fails, `systemctl status tent-worker` and `journalctl -u tent-worker --since="-5m"`.
- **cloudflare token** — hits `/user/tokens/verify`. Fails if the token is missing, revoked, or returns `disabled`/`expired`.
- per-configured-provider tokens — hits a cheap `/account` endpoint on each of hetzner/digitalocean/vultr if you have their token set.
- discord oauth configured (presence of `DISCORD_CLIENT_ID`)
- server + site counts (always passes if the DB is up; the count is just for context)

Anything red is a thing to fix before you trust further deploys. The error detail is usually enough to know where to look.

### A deploy job got stuck "running"

```bash
journalctl -u tent-worker -f
```

If the worker daemon was restarted mid-job, the job stays `running` in the DB until the worker reaps stale claims (it doesn't, today — manual fix: `UPDATE jobs SET state = 'failed', error = 'orphaned' WHERE state = 'running' AND claimed_at < NOW() - INTERVAL '30 minutes';`).

### A site is `error`

Look at `/jobs` (web) or `tent job list` (CLI), find the most recent failed deploy for that site, click in for the full ansible output. The ansible task that failed has the diagnostic.

Common failures:

- **`Server X has no Cloudflare tunnel`** — bootstrap didn't finish. Re-run server bootstrap.
- **`No Cloudflare zone owns example.com`** — you have to add the zone to Cloudflare first.
- **`ansible-playbook exited with code 4`** — SSH connection refused. Usually means the server's IP changed or the firewall is dropping you. SSH manually to confirm.
- **`probe.status not in [...]`** — the container is running but isn't responding on `127.0.0.1:<site_port>`. Usually a misconfigured template variable. Container names are template-specific: `tent-<slug>` for `static` and `nextjs-degenff`, `tent-<slug>-wp` + `tent-<slug>-db` for `wordpress`, whatever the operator's compose declares for `docker-compose`. SSH to the server, `docker ps` to find the right name, then `docker logs <name>`.

### `permission denied (publickey)` from any ansible task

The tent SSH key never made it into `authorized_keys` on the target. For selfhosted: paste the key from `/servers/<id>`. For cloud: the provider should have injected the key from `ensureSshKey` — check the provider's UI to confirm it's actually present.
