import { eq } from "drizzle-orm";
import { z } from "zod";
import { newId } from "@tent/shared";
import { getDb } from "../db/index.js";
import { sites, templates, type Site } from "../db/schema.js";
import { encryptSecret } from "../secrets/crypto.js";
import { enqueueJob } from "../jobs/queue.js";
import { AuditService } from "./audit.js";

const SlugSchema = z
  .string()
  .min(1)
  .max(48)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "lowercase alphanumeric with hyphens; no leading/trailing hyphen");

const DomainSchema = z
  .string()
  .min(3)
  .max(253)
  .regex(/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i, "valid public domain");

const CreateSiteSchema = z.object({
  slug: SlugSchema,
  domain: DomainSchema,
  serverId: z.string(),
  templateId: z.string(),
  variables: z.record(z.string(), z.unknown()).default({}),
  secretVariables: z.record(z.string(), z.string()).default({}),
  createdBy: z.string().optional(),
});
export type CreateSiteInput = z.infer<typeof CreateSiteSchema>;

export const SiteService = {
  async list(): Promise<Site[]> {
    return getDb().select().from(sites);
  },

  async get(id: string): Promise<Site | null> {
    const rows = await getDb().select().from(sites).where(eq(sites.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async getBySlug(slug: string): Promise<Site | null> {
    const rows = await getDb().select().from(sites).where(eq(sites.slug, slug)).limit(1);
    return rows[0] ?? null;
  },

  async getByDomain(domain: string): Promise<Site | null> {
    const rows = await getDb()
      .select()
      .from(sites)
      .where(eq(sites.domain, domain.toLowerCase()))
      .limit(1);
    return rows[0] ?? null;
  },

  async create(raw: CreateSiteInput): Promise<{ siteId: string; jobId: string }> {
    const input = CreateSiteSchema.parse(raw);
    const db = getDb();

    // Sanity: template must exist.
    const tmpl = await db
      .select({ id: templates.id })
      .from(templates)
      .where(eq(templates.id, input.templateId))
      .limit(1);
    if (!tmpl[0]) throw new Error(`Template ${input.templateId} not found.`);

    // Encrypt secret variables.
    const encryptedEntries: Record<string, { ciphertext: string; nonce: string }> = {};
    for (const [k, v] of Object.entries(input.secretVariables)) {
      encryptedEntries[k] = await encryptSecret(v);
    }

    const siteId = newId("site");
    await db.insert(sites).values({
      id: siteId,
      slug: input.slug,
      domain: input.domain.toLowerCase(),
      serverId: input.serverId,
      templateId: input.templateId,
      status: "pending",
      variablesPlain: input.variables,
      variablesEncrypted: encryptedEntries,
      createdBy: input.createdBy ?? null,
    });

    const job = await enqueueJob({
      kind: "site.deploy",
      params: { siteId },
      createdBy: input.createdBy ?? null,
    });

    await AuditService.record({
      actorKind: "user",
      actorUserId: input.createdBy ?? null,
      action: "site.create",
      targetKind: "site",
      targetId: siteId,
      details: { domain: input.domain, slug: input.slug, serverId: input.serverId },
    });

    return { siteId, jobId: job.id };
  },

  async redeploy(id: string, opts: { createdBy?: string } = {}): Promise<{ jobId: string }> {
    const job = await enqueueJob({
      kind: "site.redeploy",
      params: { siteId: id },
      createdBy: opts.createdBy ?? null,
    });
    return { jobId: job.id };
  },

  async backup(
    id: string,
    opts: { createdBy?: string; retentionCount?: number } = {},
  ): Promise<{ jobId: string }> {
    const job = await enqueueJob({
      kind: "site.backup",
      params: {
        siteId: id,
        ...(opts.retentionCount !== undefined ? { retentionCount: opts.retentionCount } : {}),
      },
      createdBy: opts.createdBy ?? null,
    });
    await AuditService.record({
      actorKind: "user",
      actorUserId: opts.createdBy ?? null,
      action: "site.backup",
      targetKind: "site",
      targetId: id,
    });
    return { jobId: job.id };
  },

  async destroy(id: string, opts: { createdBy?: string } = {}): Promise<{ jobId: string }> {
    await getDb().update(sites).set({ status: "destroying", updatedAt: new Date() }).where(eq(sites.id, id));
    const job = await enqueueJob({
      kind: "site.destroy",
      params: { siteId: id },
      createdBy: opts.createdBy ?? null,
    });
    await AuditService.record({
      actorKind: "user",
      actorUserId: opts.createdBy ?? null,
      action: "site.destroy",
      targetKind: "site",
      targetId: id,
    });
    return { jobId: job.id };
  },

  async updateStatus(id: string, status: Site["status"]): Promise<void> {
    await getDb().update(sites).set({ status, updatedAt: new Date() }).where(eq(sites.id, id));
  },

  async setTunnelHostname(id: string, hostname: string): Promise<void> {
    await getDb()
      .update(sites)
      .set({ cfTunnelHostname: hostname, updatedAt: new Date() })
      .where(eq(sites.id, id));
  },

  async setDnsRecordIds(id: string, ids: string[]): Promise<void> {
    await getDb()
      .update(sites)
      .set({ cfDnsRecordIds: ids, updatedAt: new Date() })
      .where(eq(sites.id, id));
  },

  async setLivePort(id: string, port: number): Promise<void> {
    await getDb()
      .update(sites)
      .set({ livePort: port, updatedAt: new Date() })
      .where(eq(sites.id, id));
  },
};
