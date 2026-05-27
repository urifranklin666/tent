import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  primaryKey,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { JobProgressEvent } from "@tent/shared";

// ─── enums ─────────────────────────────────────────────────────────────────

export const serverProviderEnum = pgEnum("server_provider", [
  "hetzner",
  "digitalocean",
  "vultr",
  "selfhosted",
]);

export const serverStatusEnum = pgEnum("server_status", [
  "pending",
  "provisioning",
  "bootstrapping",
  "ready",
  "degraded",
  "destroying",
  "destroyed",
]);

export const siteStatusEnum = pgEnum("site_status", [
  "pending",
  "provisioning",
  "deploying",
  "live",
  "error",
  "destroying",
  "destroyed",
]);

export const jobStateEnum = pgEnum("job_state", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
]);

export const userRoleEnum = pgEnum("user_role", ["viewer", "operator", "admin"]);

export const secretScopeEnum = pgEnum("secret_scope", ["global", "server", "site"]);

// ─── ssh_keys ──────────────────────────────────────────────────────────────
// tent-generated keypairs. One key per server (the private half is encrypted at rest).

export const sshKeys = pgTable("ssh_keys", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  publicKey: text("public_key").notNull(),
  privateKeyCiphertext: text("private_key_ciphertext").notNull(),
  privateKeyNonce: text("private_key_nonce").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── servers ───────────────────────────────────────────────────────────────

export const servers = pgTable(
  "servers",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    provider: serverProviderEnum("provider").notNull(),
    providerExternalId: text("provider_external_id"),
    ipv4: text("ipv4"),
    ipv6: text("ipv6"),
    status: serverStatusEnum("status").notNull().default("pending"),
    sshUser: text("ssh_user").notNull().default("root"),
    sshPort: integer("ssh_port").notNull().default(22),
    sshKeyId: text("ssh_key_id").references(() => sshKeys.id),
    region: text("region"),
    size: text("size"),
    hostFingerprint: text("host_fingerprint"),
    cfTunnelId: text("cf_tunnel_id"),
    tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    bootstrappedAt: timestamp("bootstrapped_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
  },
  (t) => ({
    nameUnique: uniqueIndex("servers_name_unique").on(t.name),
  }),
);

// ─── templates ─────────────────────────────────────────────────────────────
// registered at startup from packages/templates/<name>/manifest.json

export const templates = pgTable(
  "templates",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    description: text("description").notNull(),
    manifest: jsonb("manifest").notNull(),
    sourcePath: text("source_path").notNull(),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    nameVersionUnique: uniqueIndex("templates_name_version_unique").on(t.name, t.version),
  }),
);

// ─── sites ─────────────────────────────────────────────────────────────────

export const sites = pgTable(
  "sites",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    domain: text("domain").notNull(),
    serverId: text("server_id")
      .notNull()
      .references(() => servers.id),
    templateId: text("template_id")
      .notNull()
      .references(() => templates.id),
    status: siteStatusEnum("status").notNull().default("pending"),
    cfTunnelHostname: text("cf_tunnel_hostname"),
    cfDnsRecordIds: jsonb("cf_dns_record_ids").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    variablesPlain: jsonb("variables_plain")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    variablesEncrypted: jsonb("variables_encrypted")
      .$type<Record<string, { ciphertext: string; nonce: string }>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    dbName: text("db_name"),
    dbUser: text("db_user"),
    livePort: integer("live_port"),
    healthCheckPath: text("health_check_path").notNull().default("/healthz"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: text("created_by"),
  },
  (t) => ({
    slugUnique: uniqueIndex("sites_slug_unique").on(t.slug),
    domainUnique: uniqueIndex("sites_domain_unique").on(t.domain),
    serverIdx: index("sites_server_idx").on(t.serverId),
  }),
);

// ─── secrets ───────────────────────────────────────────────────────────────

export const secrets = pgTable(
  "secrets",
  {
    id: text("id").primaryKey(),
    scope: secretScopeEnum("scope").notNull(),
    scopeRef: text("scope_ref"),
    key: text("key").notNull(),
    ciphertext: text("ciphertext").notNull(),
    nonce: text("nonce").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  },
  (t) => ({
    // Treat scope_ref NULL as a literal grouping value via COALESCE for global-scope uniqueness.
    scopeKeyUnique: uniqueIndex("secrets_scope_ref_key_unique").on(t.scope, t.scopeRef, t.key),
  }),
);

// ─── jobs ──────────────────────────────────────────────────────────────────

export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    params: jsonb("params").notNull(),
    state: jobStateEnum("state").notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    progress: jsonb("progress")
      .$type<JobProgressEvent[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    error: text("error"),
    result: jsonb("result"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => ({
    stateCreatedIdx: index("jobs_state_created_idx").on(t.state, t.createdAt),
    kindIdx: index("jobs_kind_idx").on(t.kind),
  }),
);

// ─── users + Auth.js v5 tables ─────────────────────────────────────────────
// Auth.js Drizzle adapter expects snake_case column names verbatim.

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  discordId: text("discord_id").unique(),
  handle: text("handle").notNull(),
  name: text("name"),
  email: text("email"),
  emailVerified: timestamp("emailVerified", { mode: "date", withTimezone: true }),
  image: text("image"),
  role: userRoleEnum("role").notNull().default("viewer"),
  banned: boolean("banned").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (a) => ({
    pk: primaryKey({ columns: [a.provider, a.providerAccountId] }),
  }),
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (vt) => ({
    pk: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
);

// ─── audit_log ─────────────────────────────────────────────────────────────

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorUserId: text("actor_user_id"),
    actorKind: text("actor_kind").notNull(),
    action: text("action").notNull(),
    targetKind: text("target_kind"),
    targetId: text("target_id"),
    details: jsonb("details"),
  },
  (t) => ({
    atIdx: index("audit_log_at_idx").on(t.at),
    targetIdx: index("audit_log_target_idx").on(t.targetKind, t.targetId),
  }),
);

// ─── inferred row types ────────────────────────────────────────────────────

export type Server = typeof servers.$inferSelect;
export type NewServer = typeof servers.$inferInsert;
export type SshKey = typeof sshKeys.$inferSelect;
export type NewSshKey = typeof sshKeys.$inferInsert;
export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;
export type Secret = typeof secrets.$inferSelect;
export type NewSecret = typeof secrets.$inferInsert;
export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AuditEntry = typeof auditLog.$inferSelect;
export type NewAuditEntry = typeof auditLog.$inferInsert;
