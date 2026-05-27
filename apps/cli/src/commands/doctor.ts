import kleur from "kleur";
import { getEnv, getDb, listProviders, ServerService, SiteService } from "@tent/core";
import { sql } from "drizzle-orm";

interface Check {
  name: string;
  pass: boolean;
  detail?: string;
}

export async function cmdDoctor(): Promise<void> {
  const checks: Check[] = [];

  try {
    const env = getEnv();
    checks.push({ name: "env file loaded", pass: true });
    checks.push({ name: "cloudflare configured", pass: !!env.CLOUDFLARE_API_TOKEN, detail: env.CLOUDFLARE_API_TOKEN ? undefined : "missing CLOUDFLARE_API_TOKEN" });
    checks.push({ name: "discord oauth configured", pass: !!env.DISCORD_CLIENT_ID, detail: env.DISCORD_CLIENT_ID ? undefined : "web UI/bot won't authenticate without this" });
  } catch (err) {
    checks.push({ name: "env file loaded", pass: false, detail: String(err) });
  }

  try {
    await getDb().execute(sql`select 1`);
    checks.push({ name: "database reachable", pass: true });
  } catch (err) {
    checks.push({ name: "database reachable", pass: false, detail: String(err) });
  }

  checks.push({ name: "providers registered", pass: true, detail: listProviders().join(", ") });

  try {
    const servers = await ServerService.list();
    const ready = servers.filter((s) => s.status === "ready").length;
    checks.push({ name: "servers", pass: true, detail: `${servers.length} total, ${ready} ready` });
  } catch (err) {
    checks.push({ name: "servers", pass: false, detail: String(err) });
  }

  try {
    const sites = await SiteService.list();
    const live = sites.filter((s) => s.status === "live").length;
    checks.push({ name: "sites", pass: true, detail: `${sites.length} total, ${live} live` });
  } catch (err) {
    checks.push({ name: "sites", pass: false, detail: String(err) });
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
