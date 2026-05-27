import { z } from "zod";

export const serverProviders = ["hetzner", "digitalocean", "vultr", "selfhosted"] as const;
export const ServerProvider = z.enum(serverProviders);
export type ServerProvider = z.infer<typeof ServerProvider>;

export const serverStatuses = [
  "pending",
  "provisioning",
  "bootstrapping",
  "ready",
  "degraded",
  "destroying",
  "destroyed",
] as const;
export const ServerStatus = z.enum(serverStatuses);
export type ServerStatus = z.infer<typeof ServerStatus>;

export const siteStatuses = [
  "pending",
  "provisioning",
  "deploying",
  "live",
  "error",
  "destroying",
  "destroyed",
] as const;
export const SiteStatus = z.enum(siteStatuses);
export type SiteStatus = z.infer<typeof SiteStatus>;

export const jobStates = ["queued", "running", "succeeded", "failed", "canceled"] as const;
export const JobState = z.enum(jobStates);
export type JobState = z.infer<typeof JobState>;

export const userRoles = ["viewer", "operator", "admin"] as const;
export const UserRole = z.enum(userRoles);
export type UserRole = z.infer<typeof UserRole>;

export const secretScopes = ["global", "server", "site"] as const;
export const SecretScope = z.enum(secretScopes);
export type SecretScope = z.infer<typeof SecretScope>;

// Job kinds — extended as handlers are added.
export const jobKinds = [
  "server.provision",
  "server.bootstrap",
  "server.destroy",
  "site.deploy",
  "site.redeploy",
  "site.destroy",
  "template.sync",
  "doctor.run",
] as const;
export const JobKind = z.enum(jobKinds);
export type JobKind = z.infer<typeof JobKind>;
