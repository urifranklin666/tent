import { readFileSync } from "node:fs";
import { z } from "zod";

const EnvSchema = z.object({
  TENT_DATABASE_URL: z.string().url(),
  TENT_MASTER_KEY_FILE: z.string().min(1),
  TENT_STATE_DIR: z.string().min(1).default("/var/lib/tent"),
  TENT_PUBLIC_HOST: z.string().min(1).default("localhost:3030"),
  TENT_WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  TENT_LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  CLOUDFLARE_API_TOKEN: z.string().optional(),
  CLOUDFLARE_ACCOUNT_ID: z.string().optional(),

  HETZNER_API_TOKEN: z.string().optional(),
  DIGITALOCEAN_API_TOKEN: z.string().optional(),
  VULTR_API_KEY: z.string().optional(),

  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_GUILD_ID: z.string().optional(),
  DISCORD_ADMIN_USER_IDS: z.string().optional(),
  DISCORD_NOTIFY_WEBHOOK_URL: z.string().url().optional(),

  AUTH_SECRET: z.string().optional(),
  AUTH_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

let cachedMasterKey: Buffer | undefined;

export function getMasterKey(): Buffer {
  if (cachedMasterKey) return cachedMasterKey;
  const env = getEnv();
  const raw = readFileSync(env.TENT_MASTER_KEY_FILE, "utf8").trim();
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `Master key at ${env.TENT_MASTER_KEY_FILE} must decode to 32 bytes; got ${buf.length}. ` +
        `Generate with: openssl rand -base64 32 > ${env.TENT_MASTER_KEY_FILE} && chmod 600 $_`,
    );
  }
  cachedMasterKey = buf;
  return cachedMasterKey;
}

export function resetEnvCache(): void {
  cached = undefined;
  cachedMasterKey = undefined;
}

export function getDiscordAdminUserIds(): string[] {
  const env = getEnv();
  if (!env.DISCORD_ADMIN_USER_IDS) return [];
  return env.DISCORD_ADMIN_USER_IDS.split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
