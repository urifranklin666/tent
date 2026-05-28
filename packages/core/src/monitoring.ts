import { writeFile, mkdir } from "node:fs/promises";
import { stat } from "node:fs/promises";
import path from "node:path";
import { request } from "undici";
import { getEnv } from "./env.js";
import { logger } from "./logger.js";

/**
 * Path of the worker heartbeat file. Touched by runWorkerLoop on every tick
 * so `tent doctor` (and any external monitor) can tell whether the worker
 * is actually alive.
 */
export function workerHeartbeatPath(): string {
  return path.join(getEnv().TENT_STATE_DIR, "worker.heartbeat");
}

/**
 * Write/touch the heartbeat file. Idempotent; safe to call on every tick.
 * Failures are logged but never thrown — a heartbeat that errors should not
 * crash the worker loop.
 */
export async function touchWorkerHeartbeat(): Promise<void> {
  try {
    const p = workerHeartbeatPath();
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, new Date().toISOString() + "\n");
  } catch (err) {
    logger.warn("heartbeat write failed", { err: String(err) });
  }
}

/**
 * Heartbeat freshness, in ms since last write. null if the file is missing
 * or unreadable. Used by tent doctor.
 */
export async function readHeartbeatAge(): Promise<number | null> {
  try {
    const s = await stat(workerHeartbeatPath());
    return Date.now() - s.mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Verify a Cloudflare API token by hitting /user/tokens/verify. Returns
 * a tagged result so callers (notably `tent doctor`) can render uniformly.
 */
export async function probeCloudflareToken(token: string): Promise<{ pass: boolean; detail: string }> {
  try {
    const res = await request("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.statusCode === 200) {
      const body = (await res.body.json()) as { result?: { status?: string } };
      return { pass: body.result?.status === "active", detail: body.result?.status ?? "unknown" };
    }
    await res.body.dump();
    return { pass: false, detail: `status ${res.statusCode}` };
  } catch (err) {
    return { pass: false, detail: String(err) };
  }
}

/**
 * Hit an arbitrary URL with a Bearer token and check for a 200. Used by
 * `tent doctor` to verify provider tokens cheaply.
 */
export async function probeBearer(
  url: string,
  token: string,
): Promise<{ pass: boolean; detail: string }> {
  try {
    const res = await request(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    await res.body.dump();
    if (res.statusCode === 200) return { pass: true, detail: "ok" };
    return { pass: false, detail: `status ${res.statusCode}` };
  } catch (err) {
    return { pass: false, detail: String(err) };
  }
}

/**
 * Best-effort POST to a Discord-shaped webhook. Used to surface permanent
 * job failures to the operator without requiring them to babysit the queue.
 * Falls back to a no-op if DISCORD_NOTIFY_WEBHOOK_URL is unset.
 */
export async function notifyDiscord(content: string): Promise<void> {
  const url = getEnv().DISCORD_NOTIFY_WEBHOOK_URL;
  if (!url) return;
  try {
    const res = await request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: content.slice(0, 1900) }),
    });
    if (res.statusCode >= 400) {
      const text = await res.body.text();
      logger.warn("discord webhook returned non-2xx", {
        status: res.statusCode,
        body: text.slice(0, 200),
      });
    } else {
      // discord.com may return 204; drain body to avoid the open socket warning.
      await res.body.dump();
    }
  } catch (err) {
    logger.warn("discord webhook failed", { err: String(err) });
  }
}
