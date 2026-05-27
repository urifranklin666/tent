import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/index.js";
import { templates, type Template } from "../db/schema.js";
import { TemplateManifest } from "@tent/shared";

export const TemplateService = {
  async list(): Promise<Template[]> {
    return getDb().select().from(templates);
  },

  async get(id: string): Promise<Template | null> {
    const rows = await getDb().select().from(templates).where(eq(templates.id, id)).limit(1);
    return rows[0] ?? null;
  },

  async getByName(name: string): Promise<Template | null> {
    const rows = await getDb()
      .select()
      .from(templates)
      .where(eq(templates.name, name))
      .limit(1);
    return rows[0] ?? null;
  },

  /**
   * Coerce + validate a candidate variable bag against a template's manifest.
   * Returns `{ values, secrets }` split — the "secret" flag in the manifest decides which side a var lands on.
   */
  async validateVariables(
    templateId: string,
    input: Record<string, unknown>,
  ): Promise<{ values: Record<string, unknown>; secrets: Record<string, string> }> {
    const tmpl = await this.get(templateId);
    if (!tmpl) throw new Error(`Template ${templateId} not found.`);
    const manifestParsed = TemplateManifest.safeParse(tmpl.manifest);
    if (!manifestParsed.success) {
      throw new Error(`Stored manifest for template ${tmpl.name} is invalid: ${manifestParsed.error.message}`);
    }
    const manifest = manifestParsed.data;

    const values: Record<string, unknown> = {};
    const secrets: Record<string, string> = {};

    for (const [key, def] of Object.entries(manifest.variables)) {
      const incoming = input[key];
      if (incoming === undefined || incoming === null || incoming === "") {
        if (def.optional) continue;
        if (def.default !== undefined) {
          if (def.secret) secrets[key] = String(def.default);
          else values[key] = def.default;
          continue;
        }
        throw new Error(`Missing required variable "${key}" for template ${tmpl.name}.`);
      }

      let coerced: unknown = incoming;
      switch (def.type) {
        case "string":
          coerced = z.string().parse(incoming);
          if (def.pattern && !new RegExp(def.pattern).test(coerced as string)) {
            throw new Error(`Variable "${key}" failed pattern check.`);
          }
          break;
        case "number":
          coerced = z.coerce.number().parse(incoming);
          break;
        case "boolean":
          coerced = z.coerce.boolean().parse(incoming);
          break;
        case "enum":
          if (!def.values || !def.values.includes(String(incoming))) {
            throw new Error(`Variable "${key}" must be one of ${(def.values ?? []).join(", ")}`);
          }
          coerced = String(incoming);
          break;
      }
      if (def.secret) secrets[key] = String(coerced);
      else values[key] = coerced;
    }

    return { values, secrets };
  },
};
