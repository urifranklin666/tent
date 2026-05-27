export const CORE_VERSION = "0.1.0";

export * from "@tent/shared";

export * from "./env.js";
export * from "./logger.js";

export * as db from "./db/index.js";
export * as schema from "./db/schema.js";
export { getDb, getPool, closeDb } from "./db/index.js";
export * from "./db/schema.js";

export * as cloudflare from "./cloudflare/index.js";
export * as ssh from "./ssh/index.js";
export * as ansible from "./ansible/index.js";

export * from "./secrets/crypto.js";
export { SecretService } from "./secrets/service.js";

export * from "./providers/index.js";

export { syncTemplates, loadTemplatesFromDisk, DEFAULT_TEMPLATES_ROOT } from "./templates/index.js";

export * from "./jobs/index.js";
export { registerAllHandlers } from "./jobs/handlers/index.js";
export { ensurePrivateKeyFile } from "./keyfile.js";
export { allocateSitePort } from "./ports.js";

export { ServerService, type AddServerInput } from "./services/server.js";
export { SiteService, type CreateSiteInput } from "./services/site.js";
export { TemplateService } from "./services/template.js";
export { AuditService, type AuditInput } from "./services/audit.js";
