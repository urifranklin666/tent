import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Materialize a throwaway master key file and point env vars at it. Returns
 * the (string) path so the caller can clean up if desired (we don't bother
 * in tests — tmpfs is fine).
 */
export async function makeTestMasterKey(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "tent-test-"));
  const keyPath = path.join(dir, "master.key");
  await writeFile(keyPath, randomBytes(32).toString("base64") + "\n", { mode: 0o600 });
  return keyPath;
}

/**
 * Sets env vars to point at a fresh master key. Returns a function that
 * resets the relevant env vars + the cached singletons in env.ts.
 */
export async function withFreshEnv(): Promise<() => Promise<void>> {
  const keyPath = await makeTestMasterKey();
  process.env.TENT_DATABASE_URL = "postgres://test:test@127.0.0.1:5432/test";
  process.env.TENT_MASTER_KEY_FILE = keyPath;
  process.env.TENT_STATE_DIR = path.dirname(keyPath);

  const { resetEnvCache } = await import("../src/env.js");
  resetEnvCache();

  return async () => {
    delete process.env.TENT_DATABASE_URL;
    delete process.env.TENT_MASTER_KEY_FILE;
    delete process.env.TENT_STATE_DIR;
    resetEnvCache();
  };
}
