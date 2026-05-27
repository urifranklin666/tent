import { eq } from "drizzle-orm";
import { z } from "zod";
import { progressEvent, ServerProvider } from "@tent/shared";
import { getDb } from "../../db/index.js";
import { servers, sshKeys } from "../../db/schema.js";
import { getProvider } from "../../providers/index.js";
import { registerJobHandler } from "../handlers.js";

const ParamsSchema = z.object({
  serverId: z.string(),
  input: z.object({
    name: z.string(),
    provider: ServerProvider,
    regionId: z.string().optional(),
    sizeId: z.string().optional(),
    imageId: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

export function registerServerProvisionHandler() {
  registerJobHandler("server.provision", async (ctx) => {
    const params = ParamsSchema.parse(ctx.params);
    const db = getDb();

    const row = await db.select().from(servers).where(eq(servers.id, params.serverId)).limit(1);
    const server = row[0];
    if (!server) throw new Error(`Server ${params.serverId} not found.`);

    if (!server.sshKeyId) throw new Error("Server has no ssh key on file.");
    const keyRow = await db
      .select({ pub: sshKeys.publicKey })
      .from(sshKeys)
      .where(eq(sshKeys.id, server.sshKeyId))
      .limit(1);
    const publicKey = keyRow[0]?.pub;
    if (!publicKey) throw new Error("Failed to load public key for provisioning.");

    if (!params.input.regionId || !params.input.sizeId) {
      throw new Error("regionId and sizeId are required to provision a cloud server.");
    }

    const provider = getProvider(params.input.provider);

    await db.update(servers).set({ status: "provisioning" }).where(eq(servers.id, server.id));
    await ctx.emit(progressEvent("step.start", `provisioning ${params.input.provider} VM`, { step: "create" }));

    const created = await provider.createServer({
      provider: params.input.provider,
      name: params.input.name,
      regionId: params.input.regionId,
      sizeId: params.input.sizeId,
      imageId: params.input.imageId ?? undefined,
      sshPublicKey: publicKey,
      tags: params.input.tags,
    });

    await db
      .update(servers)
      .set({
        providerExternalId: created.providerId,
        ipv4: created.ipv4 ?? null,
        ipv6: created.ipv6 ?? null,
      })
      .where(eq(servers.id, server.id));

    await ctx.emit(progressEvent("info", `VM created: provider id ${created.providerId}, ipv4 ${created.ipv4 ?? "(pending)"}`));

    await ctx.emit(progressEvent("step.start", "waiting for VM to be running", { step: "wait" }));
    const ready = await provider.waitReady(created.providerId);
    await db
      .update(servers)
      .set({
        ipv4: ready.ipv4 ?? null,
        ipv6: ready.ipv6 ?? null,
      })
      .where(eq(servers.id, server.id));
    await ctx.emit(progressEvent("step.end", `VM is up at ${ready.ipv4 ?? ready.ipv6}`, { step: "wait" }));

    return { ipv4: ready.ipv4, ipv6: ready.ipv6 };
  });
}
