import { eq } from "drizzle-orm";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { progressEvent } from "@tent/shared";
import { getDb } from "../../db/index.js";
import { servers } from "../../db/schema.js";
import { runPlaybook } from "../../ansible/runner.js";
import { ensurePrivateKeyFile } from "../../keyfile.js";
import { waitForSsh } from "../../ssh/index.js";
import { decryptSecret } from "../../secrets/crypto.js";
import { sshKeys as sshKeysTable } from "../../db/schema.js";
import { createTunnel, generateTunnelSecret, getTunnelToken } from "../../cloudflare/tunnels.js";
import { getEnv } from "../../env.js";
import { ServerService } from "../../services/server.js";
import { registerJobHandler } from "../handlers.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PLAYBOOKS_ROOT = path.resolve(here, "../../../../ansible/playbooks");

const ParamsSchema = z.object({
  serverId: z.string(),
});

export function registerServerBootstrapHandler() {
  registerJobHandler("server.bootstrap", async (ctx) => {
    const params = ParamsSchema.parse(ctx.params);
    const db = getDb();
    const env = getEnv();

    const row = await db.select().from(servers).where(eq(servers.id, params.serverId)).limit(1);
    const server = row[0];
    if (!server) throw new Error(`Server ${params.serverId} not found.`);
    if (!server.ipv4) throw new Error("Server has no IPv4 address yet — provisioning may not have completed.");
    if (!server.sshKeyId) throw new Error("Server has no ssh key on file.");

    await db.update(servers).set({ status: "bootstrapping" }).where(eq(servers.id, server.id));

    // Decrypt private key to disk.
    const keyPath = await ensurePrivateKeyFile(server.id);

    // Wait for SSH to come up (provisioned VMs need a minute or two).
    await ctx.emit(progressEvent("step.start", "waiting for SSH", { step: "ssh" }));
    const keyRow = await db
      .select({ cipher: sshKeysTable.privateKeyCiphertext, nonce: sshKeysTable.privateKeyNonce })
      .from(sshKeysTable)
      .where(eq(sshKeysTable.id, server.sshKeyId))
      .limit(1);
    const pem = await decryptSecret({ ciphertext: keyRow[0]!.cipher, nonce: keyRow[0]!.nonce });
    const fingerprint = await waitForSsh({
      host: server.ipv4,
      port: server.sshPort,
      username: server.sshUser,
      privateKeyPem: pem,
    });
    await ServerService.setHostFingerprint(server.id, fingerprint);
    await ctx.emit(progressEvent("step.end", `SSH is up; host fingerprint ${fingerprint}`, { step: "ssh" }));

    // Create a CF tunnel for this server if Cloudflare is configured and one doesn't exist.
    let tunnelToken: string | undefined;
    if (env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID) {
      if (!server.cfTunnelId) {
        await ctx.emit(progressEvent("step.start", "creating Cloudflare tunnel", { step: "tunnel" }));
        const secret = generateTunnelSecret();
        const tunnel = await createTunnel({ name: `tent-${server.name}`, secret });
        tunnelToken = await getTunnelToken(tunnel.id);
        await ServerService.setTunnelId(server.id, tunnel.id);
        await ctx.emit(progressEvent("step.end", `tunnel ${tunnel.id} created`, { step: "tunnel" }));
      } else {
        tunnelToken = await getTunnelToken(server.cfTunnelId);
        await ctx.emit(progressEvent("info", `reusing existing tunnel ${server.cfTunnelId}`));
      }
    } else {
      await ctx.emit(progressEvent("warn", "Cloudflare not configured — skipping tunnel setup"));
    }

    // Run the bootstrap playbook.
    await ctx.emit(progressEvent("step.start", "running ansible bootstrap playbook", { step: "ansible" }));
    const result = await runPlaybook({
      playbookPath: path.join(PLAYBOOKS_ROOT, "bootstrap.yml"),
      host: {
        name: server.name,
        host: server.ipv4,
        port: server.sshPort,
        user: server.sshUser,
        privateKeyPath: keyPath,
      },
      extraVars: tunnelToken ? { tent_tunnel_token: tunnelToken } : {},
      onEvent: (e) => void ctx.emit(e),
    });

    if (result.code !== 0) {
      throw new Error(`ansible-playbook exited with code ${result.code}`);
    }
    await ctx.emit(progressEvent("step.end", "ansible bootstrap completed", { step: "ansible" }));

    await ServerService.markBootstrapped(server.id);
    return { fingerprint, tunnelId: server.cfTunnelId ?? null };
  });
}
