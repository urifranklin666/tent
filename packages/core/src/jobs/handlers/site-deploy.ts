import { eq } from "drizzle-orm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { progressEvent, TemplateManifest } from "@tent/shared";
import { getDb } from "../../db/index.js";
import { servers, sites, templates } from "../../db/schema.js";
import { runPlaybook } from "../../ansible/runner.js";
import { ensurePrivateKeyFile } from "../../keyfile.js";
import { decryptSecret } from "../../secrets/crypto.js";
import { allocateSitePort } from "../../ports.js";
import { findZoneForHost } from "../../cloudflare/zones.js";
import { createDnsRecord, deleteDnsRecord } from "../../cloudflare/dns.js";
import { upsertIngressRule } from "../../cloudflare/tunnels.js";
import { SiteService } from "../../services/site.js";
import { getEnv } from "../../env.js";
import { registerJobHandler } from "../handlers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PLAYBOOKS_ROOT = path.resolve(here, "../../../../ansible/playbooks");
const ANSIBLE_ROOT = path.resolve(here, "../../../../ansible");

const ParamsSchema = z.object({
  siteId: z.string(),
});

export function registerSiteDeployHandler() {
  const run = async (kind: string) =>
    registerJobHandler(kind, async (ctx) => {
      const params = ParamsSchema.parse(ctx.params);
      const db = getDb();
      const env = getEnv();

      const siteRows = await db.select().from(sites).where(eq(sites.id, params.siteId)).limit(1);
      const site = siteRows[0];
      if (!site) throw new Error(`Site ${params.siteId} not found.`);

      const serverRows = await db.select().from(servers).where(eq(servers.id, site.serverId)).limit(1);
      const server = serverRows[0];
      if (!server) throw new Error(`Server ${site.serverId} not found.`);
      if (server.status !== "ready") {
        throw new Error(`Server ${server.name} is not ready (status=${server.status}).`);
      }
      if (!server.ipv4) throw new Error(`Server ${server.name} has no IPv4 address.`);
      if (!server.cfTunnelId) throw new Error(`Server ${server.name} has no Cloudflare tunnel — bootstrap may be incomplete.`);

      const tmplRows = await db.select().from(templates).where(eq(templates.id, site.templateId)).limit(1);
      const template = tmplRows[0];
      if (!template) throw new Error(`Template ${site.templateId} not found.`);
      const manifest = TemplateManifest.parse(template.manifest);

      await db.update(sites).set({ status: "deploying" }).where(eq(sites.id, site.id));

      // Allocate (or reuse) port.
      let port = site.livePort;
      if (!port) {
        port = await allocateSitePort(server.id, site.id);
        await SiteService.setLivePort(site.id, port);
        await ctx.emit(progressEvent("info", `allocated local port ${port} for this site`));
      }

      // CF: find zone, create CNAME to the tunnel, add ingress rule.
      if (!env.CLOUDFLARE_API_TOKEN) {
        throw new Error("CLOUDFLARE_API_TOKEN is required to deploy sites.");
      }
      await ctx.emit(progressEvent("step.start", "configuring Cloudflare DNS + tunnel route", { step: "cf" }));
      const zone = await findZoneForHost(site.domain);
      if (!zone) {
        throw new Error(`No Cloudflare zone owns ${site.domain}. Add the zone to your Cloudflare account first.`);
      }
      const tunnelHostTarget = `${server.cfTunnelId}.cfargotunnel.com`;

      const dnsIds: string[] = [];
      try {
        const record = await createDnsRecord({
          zoneId: zone.id,
          type: "CNAME",
          name: site.domain,
          content: tunnelHostTarget,
          proxied: true,
          comment: `tent site ${site.slug}`,
        });
        dnsIds.push(record.id);
        await SiteService.setDnsRecordIds(site.id, dnsIds);
        await SiteService.setTunnelHostname(site.id, site.domain);
      } catch (err) {
        const msg = String(err);
        if (msg.includes("81057") || msg.toLowerCase().includes("already exists")) {
          await ctx.emit(progressEvent("warn", `DNS record already exists for ${site.domain}; assuming it points to the tunnel`));
        } else {
          throw err;
        }
      }

      await upsertIngressRule(server.cfTunnelId, site.domain, `http://localhost:${port}`);
      await ctx.emit(progressEvent("step.end", `${site.domain} → tunnel → localhost:${port}`, { step: "cf" }));

      // Decrypt secret variables for ansible.
      const decryptedSecrets: Record<string, string> = {};
      for (const [k, v] of Object.entries(site.variablesEncrypted ?? {})) {
        decryptedSecrets[k] = await decryptSecret(v);
      }

      // Build extra-vars. Public + secret variables are passed with var_ prefix.
      const extraVars: Record<string, unknown> = {
        site_slug: site.slug,
        site_domain: site.domain,
        site_port: port,
      };
      for (const [k, v] of Object.entries(site.variablesPlain ?? {})) {
        extraVars[`var_${k}`] = v;
      }
      for (const [k, v] of Object.entries(decryptedSecrets)) {
        extraVars[`var_${k}`] = v;
      }

      // Resolve the template's roles directory (where its `site` role lives).
      const templateRolesPath = path.join(template.sourcePath, "roles");
      const rolesPath = [templateRolesPath, path.join(ANSIBLE_ROOT, "roles")].join(":");

      const keyPath = await ensurePrivateKeyFile(server.id);

      await ctx.emit(progressEvent("step.start", "running ansible site-deploy playbook", { step: "ansible" }));
      const result = await runPlaybook({
        playbookPath: path.join(PLAYBOOKS_ROOT, "site-deploy.yml"),
        host: {
          name: server.name,
          host: server.ipv4,
          port: server.sshPort,
          user: server.sshUser,
          privateKeyPath: keyPath,
        },
        extraVars,
        envOverrides: {
          ANSIBLE_ROLES_PATH: rolesPath,
        },
        onEvent: (e) => void ctx.emit(e),
      });
      if (result.code !== 0) {
        await SiteService.updateStatus(site.id, "error");
        throw new Error(`ansible-playbook exited with code ${result.code}`);
      }
      await ctx.emit(progressEvent("step.end", "site is deployed; verifying", { step: "ansible" }));

      // We let the playbook do its own local-port HTTP probe; trusting that is enough for v1.
      await SiteService.updateStatus(site.id, "live");
      await ctx.emit(progressEvent("info", `site live at https://${site.domain}`));

      // Suppress unused-import warnings on items only used in future enhancements.
      void deleteDnsRecord;
      void manifest;

      return { url: `https://${site.domain}`, port };
    });

  run("site.deploy");
  run("site.redeploy");
}
