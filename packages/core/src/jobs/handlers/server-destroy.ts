import { eq } from "drizzle-orm";
import { z } from "zod";
import { progressEvent } from "@tent/shared";
import { getDb } from "../../db/index.js";
import { servers } from "../../db/schema.js";
import { getProvider } from "../../providers/index.js";
import { deleteTunnel } from "../../cloudflare/tunnels.js";
import { getEnv } from "../../env.js";
import { registerJobHandler } from "../handlers.js";

const ParamsSchema = z.object({
  serverId: z.string(),
});

export function registerServerDestroyHandler() {
  registerJobHandler("server.destroy", async (ctx) => {
    const params = ParamsSchema.parse(ctx.params);
    const db = getDb();
    const env = getEnv();

    const row = await db.select().from(servers).where(eq(servers.id, params.serverId)).limit(1);
    const server = row[0];
    if (!server) throw new Error(`Server ${params.serverId} not found.`);

    if (server.cfTunnelId && env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID) {
      await ctx.emit(progressEvent("info", `deleting Cloudflare tunnel ${server.cfTunnelId}`));
      try {
        await deleteTunnel(server.cfTunnelId);
      } catch (err) {
        await ctx.emit(progressEvent("warn", `failed to delete tunnel: ${String(err)}`));
      }
    }

    if (server.provider !== "selfhosted" && server.providerExternalId) {
      await ctx.emit(progressEvent("info", `destroying VM ${server.providerExternalId} via ${server.provider}`));
      const provider = getProvider(server.provider);
      try {
        await provider.destroyServer(server.providerExternalId);
      } catch (err) {
        await ctx.emit(progressEvent("error", `failed to destroy VM: ${String(err)}`));
        throw err;
      }
    }

    await db.update(servers).set({ status: "destroyed" }).where(eq(servers.id, server.id));
    await ctx.emit(progressEvent("info", "server destroyed"));
    return { destroyed: true };
  });
}
