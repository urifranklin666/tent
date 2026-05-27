import { cfCall, cfAccountId } from "./client.js";
import crypto from "node:crypto";

export interface CfTunnel {
  id: string;
  name: string;
  account_tag: string;
  status?: string;
  connections?: unknown[];
}

export interface TunnelIngressRule {
  hostname?: string;
  service: string; // e.g. "http://localhost:8080" or "http_status:404"
  path?: string;
}

export interface TunnelConfig {
  ingress: TunnelIngressRule[];
}

/**
 * Cloudflare tunnels require a 32-byte base64 "tunnel_secret". We generate one
 * per tunnel; the cloudflared daemon on the target server uses it to authenticate.
 */
export function generateTunnelSecret(): string {
  return crypto.randomBytes(32).toString("base64");
}

export interface CreateTunnelInput {
  name: string;
  secret: string;
}

export async function createTunnel(input: CreateTunnelInput): Promise<CfTunnel> {
  return cfCall<CfTunnel>(`/accounts/${cfAccountId()}/cfd_tunnel`, {
    method: "POST",
    body: { name: input.name, tunnel_secret: input.secret, config_src: "cloudflare" },
  });
}

export async function getTunnel(tunnelId: string): Promise<CfTunnel> {
  return cfCall<CfTunnel>(`/accounts/${cfAccountId()}/cfd_tunnel/${tunnelId}`);
}

export async function listTunnels(): Promise<CfTunnel[]> {
  return cfCall<CfTunnel[]>(`/accounts/${cfAccountId()}/cfd_tunnel`, {
    query: { per_page: 50, is_deleted: "false" },
  });
}

export async function deleteTunnel(tunnelId: string): Promise<void> {
  await cfCall<unknown>(`/accounts/${cfAccountId()}/cfd_tunnel/${tunnelId}`, {
    method: "DELETE",
  });
}

/**
 * Fetch the "connector token" that cloudflared on the target server uses to authenticate.
 * For remotely-managed tunnels (config_src: "cloudflare"), this is the token passed to
 * `cloudflared service install <token>`.
 */
export async function getTunnelToken(tunnelId: string): Promise<string> {
  return cfCall<string>(`/accounts/${cfAccountId()}/cfd_tunnel/${tunnelId}/token`);
}

export async function getTunnelConfig(tunnelId: string): Promise<TunnelConfig | null> {
  const result = await cfCall<{ config?: TunnelConfig } | null>(
    `/accounts/${cfAccountId()}/cfd_tunnel/${tunnelId}/configurations`,
  );
  return result?.config ?? null;
}

export async function putTunnelConfig(tunnelId: string, config: TunnelConfig): Promise<void> {
  // The default-deny "http_status:404" rule must be last in any ingress list.
  const ingress = [...config.ingress];
  const hasCatchAll = ingress.some((r) => !r.hostname && r.service === "http_status:404");
  if (!hasCatchAll) {
    ingress.push({ service: "http_status:404" });
  }
  await cfCall<unknown>(`/accounts/${cfAccountId()}/cfd_tunnel/${tunnelId}/configurations`, {
    method: "PUT",
    body: { config: { ingress } },
  });
}

/**
 * Convenience: add (or replace) one hostname → backend mapping in the tunnel ingress list.
 */
export async function upsertIngressRule(
  tunnelId: string,
  hostname: string,
  service: string,
): Promise<void> {
  const current = await getTunnelConfig(tunnelId);
  const existing = (current?.ingress ?? []).filter(
    (r) => !(r.hostname === hostname && !r.path),
  );
  // Catch-all stays last; insert new rule before it.
  const filtered = existing.filter((r) => !(r.service === "http_status:404" && !r.hostname));
  const next: TunnelIngressRule[] = [...filtered, { hostname, service }];
  await putTunnelConfig(tunnelId, { ingress: next });
}

export async function removeIngressRule(tunnelId: string, hostname: string): Promise<void> {
  const current = await getTunnelConfig(tunnelId);
  if (!current) return;
  const next = current.ingress.filter((r) => r.hostname !== hostname);
  await putTunnelConfig(tunnelId, { ingress: next });
}
