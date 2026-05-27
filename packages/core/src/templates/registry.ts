import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { TemplateManifest, type TemplateManifest as TM, newId } from "@tent/shared";
import { getDb } from "../db/index.js";
import { templates as templatesTable } from "../db/schema.js";
import { logger } from "../logger.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// packages/core/src/templates → packages/templates
const DEFAULT_TEMPLATES_ROOT = path.resolve(here, "../../../templates");

export interface LoadedTemplate {
  manifest: TM;
  sourcePath: string;
}

export async function loadTemplatesFromDisk(root = DEFAULT_TEMPLATES_ROOT): Promise<LoadedTemplate[]> {
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  const loaded: LoadedTemplate[] = [];
  for (const entry of entries) {
    const sourcePath = path.join(root, entry);
    const s = await stat(sourcePath).catch(() => null);
    if (!s || !s.isDirectory()) continue;

    const manifestPath = path.join(sourcePath, "manifest.json");
    let raw: string;
    try {
      raw = await readFile(manifestPath, "utf8");
    } catch {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      logger.warn("template manifest is not valid JSON", { sourcePath, err: String(err) });
      continue;
    }

    const result = TemplateManifest.safeParse(parsed);
    if (!result.success) {
      logger.warn("template manifest failed validation", {
        sourcePath,
        issues: result.error.issues,
      });
      continue;
    }
    loaded.push({ manifest: result.data, sourcePath });
  }
  return loaded;
}

/**
 * Read templates from disk and upsert them into the DB. Called at startup
 * by the web/bot/worker processes so the DB always reflects what's on disk.
 */
export async function syncTemplates(root?: string): Promise<number> {
  const loaded = await loadTemplatesFromDisk(root);
  const db = getDb();
  for (const t of loaded) {
    const existing = await db
      .select({ id: templatesTable.id })
      .from(templatesTable)
      .where(eq(templatesTable.name, t.manifest.name))
      .limit(1);

    if (existing[0]) {
      await db
        .update(templatesTable)
        .set({
          version: t.manifest.version,
          description: t.manifest.description,
          manifest: t.manifest,
          sourcePath: t.sourcePath,
        })
        .where(eq(templatesTable.id, existing[0].id));
    } else {
      await db.insert(templatesTable).values({
        id: newId("template"),
        name: t.manifest.name,
        version: t.manifest.version,
        description: t.manifest.description,
        manifest: t.manifest,
        sourcePath: t.sourcePath,
      });
    }
  }
  return loaded.length;
}

export { DEFAULT_TEMPLATES_ROOT };
