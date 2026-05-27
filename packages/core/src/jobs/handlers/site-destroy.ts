import { eq } from "drizzle-orm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { progressEvent } from "@tent/shared";
import { getDb } from "../../db/index.js";
import { servers, sites } from "../../db/schema.js";
import { runPlaybook } from "../../ansible/runner.js";
import { ensurePrivateKeyFile } from "../../keyfile.js";
import { findZoneForHost } from "../../cloudflare/zones.js";
import { deleteDnsRecord } from "../../cloudflare/dns.js";
import { removeIngressRule } from "../../cloudflare/tunnels.js";
import { SiteService } from "../../services/site.js";
import { getEnv } from "../../env.js";
import { registerJobHandler } from "../handlers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PLAYBOOKS_ROOT = path.resolve(here, "../../../../ansible/playbooks");

const ParamsSchema = z.object({ siteId: z.string() });

export function registerSiteDestroyHandler() {
  registerJobHandler("site.destroy", async (ctx) => {
    const params = ParamsSchema.parse(ctx.params);
    const db = getDb();
    const env = getEnv();

    const siteRows = await db.select().from(sites).where(eq(sites.id, params.siteId)).limit(1);
    const site = siteRows[0];
    if (!site) throw new Error(`Site ${params.siteId} not found.`);

    const serverRows = await db.select().from(servers).where(eq(servers.id, site.serverId)).limit(1);
    const server = serverRows[0];

    // 1. Remove CF tunnel ingress rule and DNS records.
    if (env.CLOUDFLARE_API_TOKEN && server?.cfTunnelId) {
      try {
        await removeIngressRule(server.cfTunnelId, site.domain);
        await ctx.emit(progressEvent("info", `removed tunnel ingress rule for ${site.domain}`));
      } catch (err) {
        await ctx.emit(progressEvent("warn", `failed to remove ingress: ${String(err)}`));
      }
      const zone = await findZoneForHost(site.domain).catch(() => null);
      if (zone) {
        for (const recId of site.cfDnsRecordIds ?? []) {
          try {
            await deleteDnsRecord(zone.id, recId);
            await ctx.emit(progressEvent("info", `deleted DNS record ${recId}`));
          } catch (err) {
            await ctx.emit(progressEvent("warn", `failed to delete DNS ${recId}: ${String(err)}`));
          }
        }
      }
    }

    // 2. SSH into the server and tear down the site dir / containers.
    if (server && server.ipv4 && server.status !== "destroyed") {
      try {
        const keyPath = await ensurePrivateKeyFile(server.id);
        const result = await runPlaybook({
          playbookPath: path.join(PLAYBOOKS_ROOT, "site-destroy.yml"),
          host: {
            name: server.name,
            host: server.ipv4,
            port: server.sshPort,
            user: server.sshUser,
            privateKeyPath: keyPath,
          },
          extraVars: { site_slug: site.slug },
          onEvent: (e) => void ctx.emit(e),
        });
        if (result.code !== 0) {
          await ctx.emit(progressEvent("warn", `site-destroy playbook exited ${result.code}; continuing`));
        }
      } catch (err) {
        await ctx.emit(progressEvent("warn", `failed to tear down on-server: ${String(err)}`));
      }
    }

    await SiteService.updateStatus(site.id, "destroyed");
    return { destroyed: true };
  });
}
