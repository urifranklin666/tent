import sodium from "libsodium-wrappers";
import { getMasterKey } from "../env.js";

let ready: Promise<void> | undefined;

async function ensureReady(): Promise<void> {
  if (!ready) {
    ready = sodium.ready;
  }
  await ready;
}

export interface EncryptedValue {
  ciphertext: string; // base64
  nonce: string; // base64
}

export async function encryptSecret(plaintext: string): Promise<EncryptedValue> {
  await ensureReady();
  const key = getMasterKey();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ct = sodium.crypto_secretbox_easy(sodium.from_string(plaintext), nonce, key);
  return {
    ciphertext: Buffer.from(ct).toString("base64"),
    nonce: Buffer.from(nonce).toString("base64"),
  };
}

export async function decryptSecret(value: EncryptedValue): Promise<string> {
  await ensureReady();
  const key = getMasterKey();
  const ct = Buffer.from(value.ciphertext, "base64");
  const nonce = Buffer.from(value.nonce, "base64");
  const plain = sodium.crypto_secretbox_open_easy(ct, nonce, key);
  return sodium.to_string(plain);
}

// For convenience when encrypting non-string secrets — we serialize to JSON first.
export async function encryptJson(value: unknown): Promise<EncryptedValue> {
  return encryptSecret(JSON.stringify(value));
}

export async function decryptJson<T = unknown>(value: EncryptedValue): Promise<T> {
  const plain = await decryptSecret(value);
  return JSON.parse(plain) as T;
}
