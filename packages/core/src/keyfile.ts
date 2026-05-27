import { writeFile, mkdir, chmod, stat } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "./env.js";
import { getDb } from "./db/index.js";
import { sshKeys, servers } from "./db/schema.js";
import { eq } from "drizzle-orm";
import { decryptSecret } from "./secrets/crypto.js";

/**
 * Ensure the private SSH key for a server exists on disk at a stable path (0600).
 * Lazy: writes only if missing. Returns the path.
 */
export async function ensurePrivateKeyFile(serverId: string): Promise<string> {
  const stateDir = getEnv().TENT_STATE_DIR;
  const keysDir = path.join(stateDir, "ssh-keys");
  const keyPath = path.join(keysDir, `${serverId}.pem`);

  try {
    const s = await stat(keyPath);
    if (s.isFile()) return keyPath;
  } catch {
    // missing — write it
  }

  const db = getDb();
  const rows = await db
    .select({
      cipher: sshKeys.privateKeyCiphertext,
      nonce: sshKeys.privateKeyNonce,
    })
    .from(servers)
    .innerJoin(sshKeys, eq(sshKeys.id, servers.sshKeyId))
    .where(eq(servers.id, serverId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new Error(`No ssh key on file for server ${serverId}`);
  }

  const pem = await decryptSecret({ ciphertext: row.cipher, nonce: row.nonce });
  await mkdir(keysDir, { recursive: true, mode: 0o700 });
  await writeFile(keyPath, pem, { mode: 0o600 });
  await chmod(keyPath, 0o600);
  return keyPath;
}
