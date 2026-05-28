import kleur from "kleur";
import { sql } from "drizzle-orm";
import {
  getEnv,
  getDb,
  getMasterKey,
  listProviders,
  ServerService,
  SiteService,
  readHeartbeatAge,
  workerHeartbeatPath,
  probeCloudflareToken,
  probeBearer,
} from "@tent/core";

interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

function add(checks: Check[], name: string, pass: boolean, detail?: string) {
  checks.push(pass ? { name, pass, ...(detail ? { detail } : {}) } : { name, pass, detail: detail ?? "" });
}

export async function cmdDoctor(): Promise<void> {
  const checks: Check[] = [];

  let env: ReturnType<typeof getEnv> | undefined;
  try {
    env = getEnv();
    add(checks, "env file loaded", true);
  } catch (err) {
    add(checks, "env file loaded", false, String(err));
  }

  if (env) {
    try {
      getMasterKey();
      add(checks, "master key readable + 32 bytes", true);
    } catch (err) {
      add(checks, "master key readable + 32 bytes", false, String(err));
    }

    try {
      await getDb().execute(sql`select 1`);
      add(checks, "database reachable", true);
    } catch (err) {
      add(checks, "database reachable", false, String(err));
    }

    add(checks, "providers registered", true, listProviders().join(", "));

    // Worker heartbeat.
    try {
      const ageMs = await readHeartbeatAge();
      if (ageMs === null) {
        add(checks, "worker heartbeat", false, `missing at ${workerHeartbeatPath()}`);
      } else if (ageMs > 120_000) {
        add(checks, "worker heartbeat", false, `stale (${Math.round(ageMs / 1000)}s old)`);
      } else {
        add(checks, "worker heartbeat", true, `${Math.round(ageMs / 1000)}s ago`);
      }
    } catch (err) {
      add(checks, "worker heartbeat", false, String(err));
    }

    // Cloudflare token validity.
    if (env.CLOUDFLARE_API_TOKEN) {
      const ok = await probeCloudflareToken(env.CLOUDFLARE_API_TOKEN);
      add(checks, "cloudflare token", ok.pass, ok.detail);
    } else {
      add(checks, "cloudflare token", false, "missing CLOUDFLARE_API_TOKEN");
    }

    // Per-configured-provider auth probes. Skipped when not configured.
    if (env.HETZNER_API_TOKEN) {
      const r = await probeBearer("https://api.hetzner.cloud/v1/locations?per_page=1", env.HETZNER_API_TOKEN);
      add(checks, "hetzner token", r.pass, r.detail);
    }
    if (env.DIGITALOCEAN_API_TOKEN) {
      const r = await probeBearer("https://api.digitalocean.com/v2/account", env.DIGITALOCEAN_API_TOKEN);
      add(checks, "digitalocean token", r.pass, r.detail);
    }
    if (env.VULTR_API_KEY) {
      const r = await probeBearer("https://api.vultr.com/v2/account", env.VULTR_API_KEY);
      add(checks, "vultr token", r.pass, r.detail);
    }

    add(
      checks,
      "discord oauth configured",
      !!env.DISCORD_CLIENT_ID,
      env.DISCORD_CLIENT_ID ? `client ${env.DISCORD_CLIENT_ID.slice(0, 8)}…` : "web UI/bot won't authenticate without this",
    );

    try {
      const servers = await ServerService.list();
      const ready = servers.filter((s) => s.status === "ready").length;
      add(checks, "servers", true, `${servers.length} total, ${ready} ready`);
    } catch (err) {
      add(checks, "servers", false, String(err));
    }

    try {
      const sites = await SiteService.list();
      const live = sites.filter((s) => s.status === "live").length;
      add(checks, "sites", true, `${sites.length} total, ${live} live`);
    } catch (err) {
      add(checks, "sites", false, String(err));
    }
  }

  for (const c of checks) {
    const mark = c.pass ? kleur.green("✓") : kleur.red("✗");
    console.log(`${mark} ${c.name}${c.detail ? kleur.dim(` — ${c.detail}`) : ""}`);
  }

  const failed = checks.filter((c) => !c.pass).length;
  if (failed > 0) {
    console.log(kleur.red(`\n${failed} check(s) failed`));
    process.exit(1);
  }
  console.log(kleur.green(`\nall good`));
}

