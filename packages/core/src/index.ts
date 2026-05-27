export const CORE_VERSION = "0.1.0";

// Phase 1 will populate:
//   - db/         schema, migrations, pool
//   - secrets/    libsodium master-key crypto
//   - cloudflare/ zones, DNS, tunnels
//   - ssh/        ssh2 wrapper, host TOFU
//   - ansible/    runner with structured stdout streaming
//   - providers/  Hetzner, DigitalOcean, Vultr, self-hosted
//   - templates/  registry + render
//   - jobs/       Postgres-backed queue + worker
//   - services/   ServerService, SiteService, etc.
