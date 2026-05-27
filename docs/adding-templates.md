# Adding a new template

> For AI assistants extending the framework with new stack templates. Filled in alongside Phase 5.

## The contract a template must satisfy

Each template is a directory under `packages/templates/<name>/` containing:

1. **`manifest.json`** — zod-validated metadata:
   ```json
   {
     "name": "static",
     "version": "1.0.0",
     "description": "Single-page static HTML site served by nginx.",
     "variables": {
       "title": { "type": "string", "default": "untitled" },
       "favicon_url": { "type": "string", "optional": true }
     },
     "requires": {
       "docker": true,
       "postgres": false,
       "nodejs": false
     },
     "ports": {
       "internal": 80
     }
   }
   ```
2. **`role/`** — an Ansible role that takes the rendered variables and deploys the site on a target server.
3. **`files/`** — static assets copied into the role (Dockerfile, nginx.conf, default landing page, etc.).

## Sections to fill (alongside Phase 5)

- Variable schema design — when to use string vs secret vs enum
- DB allocation — how `tent` mints per-site Postgres creds and what your role does with them
- Ingress contract — how to declare the port your container listens on so the per-server tunnel routes to it
- Health check contract — every template's role must expose `/healthz` returning 200 OK once the site is live
- Backup contract — what your role drops into `/var/lib/tent/backups/<site>/`
- Idempotency — every role must be safe to re-run on an unchanged config
