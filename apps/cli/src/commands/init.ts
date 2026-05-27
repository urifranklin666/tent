import { existsSync } from "node:fs";
import { stat, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import * as p from "@clack/prompts";
import kleur from "kleur";
import { getEnv, getMasterKey, syncTemplates, getDb, closeDb } from "@tent/core";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const here = path.dirname(fileURLToPath(import.meta.url));
// apps/cli/dist/commands/init.js → ../../../../packages/core/drizzle (built)
// apps/cli/src/commands/init.ts → ../../../../packages/core/drizzle (dev)
const MIGRATIONS_FOLDER = path.resolve(here, "../../../../packages/core/drizzle");

export async function cmdInit(): Promise<void> {
  p.intro(kleur.bold().red("tent init"));

  // 1. Env present?
  p.log.step("checking environment");
  let env: ReturnType<typeof getEnv>;
  try {
    env = getEnv();
  } catch (err) {
    p.log.error(String(err));
    p.outro(kleur.red("env is incomplete — run ops/install.sh as root first, or edit /etc/tent/env"));
    process.exit(1);
  }
  p.log.success(`env loaded — db=${env.TENT_DATABASE_URL.replace(/:[^:@/]+@/, ":****@")}`);

  // 2. Master key
  p.log.step("checking master key");
  if (!existsSync(env.TENT_MASTER_KEY_FILE)) {
    p.log.error(`master key file missing at ${env.TENT_MASTER_KEY_FILE}`);
    p.note(
      `Generate it as root with:\n` +
        `  openssl rand -base64 32 > ${env.TENT_MASTER_KEY_FILE} && chmod 600 ${env.TENT_MASTER_KEY_FILE}`,
      "create the master key",
    );
    process.exit(1);
  }
  try {
    getMasterKey();
    p.log.success("master key loaded");
  } catch (err) {
    p.log.error(String(err));
    process.exit(1);
  }

  // 3. State directory
  p.log.step("checking state directory");
  await mkdir(env.TENT_STATE_DIR, { recursive: true }).catch(() => {});
  await mkdir(path.join(env.TENT_STATE_DIR, "ssh-keys"), { recursive: true, mode: 0o700 }).catch(() => {});
  await mkdir(path.join(env.TENT_STATE_DIR, "ansible-runs"), { recursive: true }).catch(() => {});
  try {
    await stat(env.TENT_STATE_DIR);
    p.log.success(`state dir ready at ${env.TENT_STATE_DIR}`);
  } catch {
    p.log.error(`could not create or access state dir ${env.TENT_STATE_DIR}`);
    process.exit(1);
  }

  // 4. DB connectivity
  p.log.step("pinging database");
  try {
    await getDb().execute(sql`select 1`);
    p.log.success("database reachable");
  } catch (err) {
    p.log.error(String(err));
    p.outro(kleur.red("database is not reachable — check TENT_DATABASE_URL and that postgres is running"));
    process.exit(1);
  }

  // 5. Migrations
  p.log.step("applying any pending migrations");
  try {
    await migrate(getDb(), { migrationsFolder: MIGRATIONS_FOLDER });
    p.log.success("migrations up to date");
  } catch (err) {
    p.log.error(`migration failed: ${String(err)}`);
    p.note(
      `If this is the first install, generate the initial migration with:\n  pnpm -F @tent/core db:generate\nThen re-run \`tent init\`.`,
      "first-install hint",
    );
    process.exit(1);
  }

  // 6. Templates sync
  p.log.step("syncing built-in templates");
  try {
    const count = await syncTemplates();
    p.log.success(`${count} template(s) registered`);
  } catch (err) {
    p.log.error(`template sync failed: ${String(err)}`);
  }

  await closeDb();
  p.outro(kleur.green().bold("tent is ready. next: `tent server add`."));
}
