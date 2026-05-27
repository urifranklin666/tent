import { cfCall } from "./client.js";

export interface CfZone {
  id: string;
  name: string;
  status: string;
  account: { id: string };
}

export async function listZones(): Promise<CfZone[]> {
  return cfCall<CfZone[]>("/zones", { query: { per_page: 50 } });
}

/**
 * Find the most-specific zone that owns the given hostname.
 * For host `cool.deadplug.digital`, will prefer zone `deadplug.digital` over `digital`.
 */
export async function findZoneForHost(host: string): Promise<CfZone | null> {
  const zones = await listZones();
  const lower = host.toLowerCase();
  const candidates = zones.filter((z) => lower === z.name || lower.endsWith(`.${z.name}`));
  candidates.sort((a, b) => b.name.length - a.name.length);
  return candidates[0] ?? null;
}
