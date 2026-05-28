import { describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TemplateManifest } from "@tent/shared";

const here = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_ROOT = path.resolve(here, "../../templates");

describe("TemplateManifest", () => {
  it("accepts a minimal manifest", () => {
    const r = TemplateManifest.safeParse({
      name: "minimal",
      version: "1.0.0",
      description: "just enough",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid name (uppercase)", () => {
    const r = TemplateManifest.safeParse({
      name: "BadName",
      version: "1.0.0",
      description: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid version (not semver)", () => {
    const r = TemplateManifest.safeParse({
      name: "ab",
      version: "1.0",
      description: "x",
    });
    expect(r.success).toBe(false);
  });

  it("populates defaults for requires when absent", () => {
    const r = TemplateManifest.safeParse({
      name: "ab",
      version: "1.0.0",
      description: "x",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.requires).toEqual({ docker: false, postgres: false, nodejs: false });
      expect(r.data.healthCheckPath).toBe("/healthz");
    }
  });

  it("validates every shipped template", async () => {
    const entries = await readdir(TEMPLATES_ROOT);
    let checked = 0;
    for (const entry of entries) {
      const manifestPath = path.join(TEMPLATES_ROOT, entry, "manifest.json");
      let raw: string;
      try {
        raw = await readFile(manifestPath, "utf8");
      } catch {
        continue;
      }
      const parsed = TemplateManifest.safeParse(JSON.parse(raw));
      expect(parsed.success, `${entry}/manifest.json failed`).toBe(true);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(4); // static, nextjs-degenff, wordpress, docker-compose
  });
});
