import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { withFreshEnv } from "./setup.js";

describe("secrets/crypto round-trip", () => {
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    teardown = await withFreshEnv();
  });
  afterAll(async () => {
    await teardown();
  });

  it("encrypts and decrypts a string", async () => {
    const { encryptSecret, decryptSecret } = await import("../src/secrets/crypto.js");
    const plaintext = "hunter2";
    const enc = await encryptSecret(plaintext);
    expect(enc.ciphertext).toBeTypeOf("string");
    expect(enc.nonce).toBeTypeOf("string");
    expect(enc.ciphertext).not.toContain(plaintext);
    const back = await decryptSecret(enc);
    expect(back).toBe(plaintext);
  });

  it("encrypts and decrypts an empty string", async () => {
    const { encryptSecret, decryptSecret } = await import("../src/secrets/crypto.js");
    const enc = await encryptSecret("");
    expect(await decryptSecret(enc)).toBe("");
  });

  it("encrypts and decrypts unicode", async () => {
    const { encryptSecret, decryptSecret } = await import("../src/secrets/crypto.js");
    const plaintext = "🛡️ tent — control plane 🏕️ ünìcödé";
    const enc = await encryptSecret(plaintext);
    expect(await decryptSecret(enc)).toBe(plaintext);
  });

  it("produces different ciphertexts for the same plaintext (random nonce)", async () => {
    const { encryptSecret } = await import("../src/secrets/crypto.js");
    const a = await encryptSecret("same");
    const b = await encryptSecret("same");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.nonce).not.toBe(b.nonce);
  });

  it("fails to decrypt with a corrupted ciphertext", async () => {
    const { encryptSecret, decryptSecret } = await import("../src/secrets/crypto.js");
    const enc = await encryptSecret("something");
    const bad = { ...enc, ciphertext: enc.ciphertext.slice(0, -4) + "AAAA" };
    await expect(decryptSecret(bad)).rejects.toThrow();
  });

  it("round-trips JSON values", async () => {
    const { encryptJson, decryptJson } = await import("../src/secrets/crypto.js");
    const value = { a: 1, b: [true, null, "x"], c: { d: 0.5 } };
    const enc = await encryptJson(value);
    expect(await decryptJson(enc)).toEqual(value);
  });
});
