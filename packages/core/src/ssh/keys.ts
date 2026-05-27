import { generateKeyPairSync, createHash } from "node:crypto";

export interface KeyPair {
  publicKeyOpenSsh: string;
  privateKeyPem: string;
}

/**
 * Generate a fresh ed25519 keypair suitable for SSH.
 * Returned in OpenSSH format (public) and PKCS#8 PEM (private) — both forms ssh2 understands.
 */
export function generateEd25519Keypair(comment = "tent"): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");

  // Build the OpenSSH public-key wire format manually.
  // ed25519 public key DER (SPKI) has a fixed shape: the last 32 bytes are the raw key.
  const der = publicKey.export({ format: "der", type: "spki" });
  const raw = der.subarray(der.length - 32);

  // OpenSSH packet: string "ssh-ed25519" + string <raw key>
  const algo = Buffer.from("ssh-ed25519");
  const algoLen = Buffer.alloc(4);
  algoLen.writeUInt32BE(algo.length);
  const keyLen = Buffer.alloc(4);
  keyLen.writeUInt32BE(raw.length);
  const blob = Buffer.concat([algoLen, algo, keyLen, raw]);
  const publicKeyOpenSsh = `ssh-ed25519 ${blob.toString("base64")} ${comment}`;

  const privateKeyPem = privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();

  return { publicKeyOpenSsh, privateKeyPem };
}

/**
 * SHA-256 host-key fingerprint in OpenSSH "SHA256:<base64>" format.
 */
export function sshFingerprint(hostKeyBlob: Buffer): string {
  const h = createHash("sha256").update(hostKeyBlob).digest("base64").replace(/=+$/, "");
  return `SHA256:${h}`;
}
