import { eq } from "drizzle-orm";
import { z } from "zod";
import { newId, ServerProvider } from "@tent/shared";
import { getDb } from "../db/index.js";
import { servers, sshKeys, type Server } from "../db/schema.js";
import { encryptSecret } from "../secrets/crypto.js";
import { generateEd25519Keypair } from "../ssh/keys.js";
import { enqueueJob } from "../jobs/queue.js";
import { AuditService } from "./audit.js";

const HostnameLike = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i, "must be alphanumeric with hyphens, no leading/trailing hyphen");

const AddServerSchema = z.object({
  name: HostnameLike,
  provider: ServerProvider,
  regionId: z.string().optional(),
  sizeId: z.string().optional(),
  imageId: z.string().optional(),
  // For selfhosted: operator supplies these directly.
  host: z.string().optional(),
  sshUser: z.string().default("root"),
  sshPort: z.coerce.number().int().min(1).max(65535).default(22),
  tags: z.array(z.string()).default([]),
  createdBy: z.string().optional(),
});
export type AddServerInput = z.infer<typeof AddServerSchema>;

export const ServerService = {
  async list(): Promise<Server[]> {
    return getDb().select().from(servers);
  },

  async get(id: string): Promise<Server | null> {
    const rows = await getDb().select().from(servers).where(eq(servers.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async getByName(name: string): Promise<Server | null> {
    const rows = await getDb().select().from(servers).where(eq(servers.name, name)).limit(1);
    return rows[0] ?? null;
  },

  /**
   * Register a new server in the inventory and enqueue provision + bootstrap jobs.
   * For selfhosted: operator must have supplied `host` and the public key has been copied onto the box.
   */
  async add(raw: AddServerInput): Promise<{ serverId: string; provisionJobId: string | null; bootstrapJobId: string }> {
    const input = AddServerSchema.parse(raw);
    const db = getDb();

    // 1. Generate keypair for this server.
    const kp = generateEd25519Keypair(`tent-${input.name}`);
    const enc = await encryptSecret(kp.privateKeyPem);
    const sshKeyId = newId("sshKey");
    await db.insert(sshKeys).values({
      id: sshKeyId,
      name: `tent-${input.name}`,
      publicKey: kp.publicKeyOpenSsh,
      privateKeyCiphertext: enc.ciphertext,
      privateKeyNonce: enc.nonce,
    });

    // 2. Insert server row.
    const serverId = newId("server");
    await db.insert(servers).values({
      id: serverId,
      name: input.name,
      provider: input.provider,
      status: input.provider === "selfhosted" ? "bootstrapping" : "pending",
      sshUser: input.sshUser,
      sshPort: input.sshPort,
      sshKeyId,
      ipv4: input.host ?? null,
      region: input.regionId ?? null,
      size: input.sizeId ?? null,
      tags: input.tags,
      createdBy: input.createdBy ?? null,
    });

    // 3. Enqueue jobs. Selfhosted skips provisioning.
    let provisionJobId: string | null = null;
    if (input.provider !== "selfhosted") {
      provisionJobId = (
        await enqueueJob({
          kind: "server.provision",
          params: { serverId, input },
          createdBy: input.createdBy ?? null,
        })
      ).id;
    }
    const bootstrapJob = await enqueueJob({
      kind: "server.bootstrap",
      params: { serverId },
      createdBy: input.createdBy ?? null,
    });

    await AuditService.record({
      actorKind: "user",
      actorUserId: input.createdBy ?? null,
      action: "server.add",
      targetKind: "server",
      targetId: serverId,
      details: { provider: input.provider, name: input.name },
    });

    return { serverId, provisionJobId, bootstrapJobId: bootstrapJob.id };
  },

  async updateStatus(id: string, status: Server["status"]): Promise<void> {
    await getDb().update(servers).set({ status, updatedAt: new Date() }).where(eq(servers.id, id));
  },

  async setIpv4(id: string, ipv4: string): Promise<void> {
    await getDb().update(servers).set({ ipv4, updatedAt: new Date() }).where(eq(servers.id, id));
  },

  async setHostFingerprint(id: string, fingerprint: string): Promise<void> {
    await getDb()
      .update(servers)
      .set({ hostFingerprint: fingerprint, updatedAt: new Date() })
      .where(eq(servers.id, id));
  },

  async markBootstrapped(id: string): Promise<void> {
    await getDb()
      .update(servers)
      .set({ status: "ready", bootstrappedAt: new Date(), updatedAt: new Date() })
      .where(eq(servers.id, id));
  },

  async setTunnelId(id: string, cfTunnelId: string): Promise<void> {
    await getDb().update(servers).set({ cfTunnelId, updatedAt: new Date() }).where(eq(servers.id, id));
  },

  async destroy(id: string, opts: { createdBy?: string } = {}): Promise<{ jobId: string }> {
    await this.updateStatus(id, "destroying");
    const job = await enqueueJob({
      kind: "server.destroy",
      params: { serverId: id },
      createdBy: opts.createdBy ?? null,
    });
    await AuditService.record({
      actorKind: "user",
      actorUserId: opts.createdBy ?? null,
      action: "server.destroy",
      targetKind: "server",
      targetId: id,
    });
    return { jobId: job.id };
  },
};

