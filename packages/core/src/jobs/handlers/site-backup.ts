import { eq } from "drizzle-orm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { progressEvent } from "@tent/shared";
import { getDb } from "../../db/index.js";
import { servers, sites } from "../../db/schema.js";
import { runPlaybook } from "../../ansible/runner.js";
import { ensurePrivateKeyFile } from "../../keyfile.js";
import { registerJobHandler } from "../handlers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PLAYBOOKS_ROOT = path.resolve(here, "../../../../ansible/playbooks");

const ParamsSchema = z.object({
  siteId: z.string(),
  retentionCount: z.number().int().positive().optional(),
});

export function registerSiteBackupHandler() {
  registerJobHandler("site.backup", async (ctx) => {
    const params = ParamsSchema.parse(ctx.params);
    const db = getDb();

    const siteRows = await db.select().from(sites).where(eq(sites.id, params.siteId)).limit(1);
    const site = siteRows[0];
    if (!site) throw new Error(`Site ${params.siteId} not found.`);

    const serverRows = await db.select().from(servers).where(eq(servers.id, site.serverId)).limit(1);
    const server = serverRows[0];
    if (!server) throw new Error(`Server ${site.serverId} not found.`);
    if (!server.ipv4) throw new Error(`Server ${server.name} has no IPv4 address.`);
    if (server.status !== "ready") {
      throw new Error(`Server ${server.name} is ${server.status}, not ready.`);
    }

    await ctx.emit(progressEvent("step.start", `snapshotting ${site.domain}`, { step: "backup" }));

    const keyPath = await ensurePrivateKeyFile(server.id);
    const result = await runPlaybook({
      playbookPath: path.join(PLAYBOOKS_ROOT, "site-backup.yml"),
      host: {
        name: server.name,
        host: server.ipv4,
        port: server.sshPort,
        user: server.sshUser,
        privateKeyPath: keyPath,
      },
      extraVars: {
        site_slug: site.slug,
        ...(params.retentionCount !== undefined ? { retention_count: params.retentionCount } : {}),
      },
      onEvent: (e) => void ctx.emit(e),
    });
    if (result.code !== 0) {
      throw new Error(`ansible-playbook site-backup exited with code ${result.code}`);
    }

    await ctx.emit(progressEvent("step.end", `${site.domain} snapshotted`, { step: "backup" }));
    await ctx.emit(progressEvent("result", `backup written to /var/lib/tent/backups/${site.slug}/ on ${server.name}`));
    return { siteId: site.id, serverId: server.id };
  });
}
