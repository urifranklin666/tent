import { request } from "undici";
import { getEnv } from "../env.js";
import type { VpsProvider } from "./base.js";
import { ProviderNotConfiguredError } from "./base.js";
import type {
  ProvisionOptions,
  CreatedServer,
  Region,
  Size,
  Image,
} from "@tent/shared";

const HCLOUD_BASE = "https://api.hetzner.cloud/v1";

interface HcloudListResponse<T> {
  [key: string]: T[] | unknown;
}

interface HServer {
  id: number;
  name: string;
  status: string;
  public_net: {
    ipv4: { ip: string } | null;
    ipv6: { ip: string } | null;
  };
}
interface HServerType {
  id: number;
  name: string;
  description: string;
  cores: number;
  memory: number; // GB
  disk: number; // GB
  prices: Array<{ location: string; price_monthly: { gross: string } }>;
}
interface HLocation {
  id: number;
  name: string;
  description: string;
  country: string;
  city: string;
}
interface HImage {
  id: number;
  name: string | null;
  description: string;
  os_flavor: string;
  os_version: string | null;
  type: string;
}
interface HSshKey {
  id: number;
  name: string;
  fingerprint: string;
  public_key: string;
}

function token(): string {
  const t = getEnv().HETZNER_API_TOKEN;
  if (!t) throw new ProviderNotConfiguredError("hetzner", "HETZNER_API_TOKEN");
  return t;
}

async function hcloud<T>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const url = new URL(HCLOUD_BASE + path);
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const res = await request(url.toString(), {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) {
    throw new Error(`Hetzner API ${init.method ?? "GET"} ${path} → ${res.statusCode}: ${text.slice(0, 400)}`);
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const hetznerProvider: VpsProvider = {
  id: "hetzner",

  async listRegions(): Promise<Region[]> {
    const res = await hcloud<{ locations: HLocation[] }>("/locations");
    return res.locations.map((l) => ({
      id: l.name,
      label: `${l.city}, ${l.country} (${l.description})`,
      country: l.country,
      city: l.city,
    }));
  },

  async listSizes(regionId?: string): Promise<Size[]> {
    const res = await hcloud<{ server_types: HServerType[] }>("/server_types");
    return res.server_types.map((t) => {
      const priceEntry = regionId ? t.prices.find((p) => p.location === regionId) : t.prices[0];
      const monthly = priceEntry ? Number(priceEntry.price_monthly.gross) : 0;
      return {
        id: t.name,
        label: `${t.name} — ${t.description}`,
        cpuCores: t.cores,
        memoryMb: t.memory * 1024,
        diskGb: t.disk,
        monthlyPriceUsd: Number.isFinite(monthly) ? monthly : 0,
      };
    });
  },

  async listImages(): Promise<Image[]> {
    const res = await hcloud<{ images: HImage[] }>("/images", {
      query: { type: "system", per_page: 50 },
    });
    return res.images
      .filter((i) => i.os_flavor && i.name)
      .map((i) => ({
        id: i.name as string,
        label: `${i.os_flavor} ${i.os_version ?? ""} (${i.description})`.trim(),
        os: i.os_flavor,
        version: i.os_version ?? "",
      }));
  },

  async ensureSshKey(name: string, publicKey: string): Promise<{ id: string }> {
    const list = await hcloud<{ ssh_keys: HSshKey[] }>("/ssh_keys", { query: { name } });
    const existing = list.ssh_keys.find((k) => k.name === name);
    if (existing) {
      // If the stored key doesn't match, replace it.
      if (existing.public_key.trim() !== publicKey.trim()) {
        await hcloud(`/ssh_keys/${existing.id}`, { method: "DELETE" });
      } else {
        return { id: String(existing.id) };
      }
    }
    const created = await hcloud<{ ssh_key: HSshKey }>("/ssh_keys", {
      method: "POST",
      body: { name, public_key: publicKey },
    });
    return { id: String(created.ssh_key.id) };
  },

  async createServer(opts: ProvisionOptions): Promise<CreatedServer> {
    const keyResult = await this.ensureSshKey(`tent-${opts.name}`, opts.sshPublicKey);
    const body: Record<string, unknown> = {
      name: opts.name,
      server_type: opts.sizeId,
      location: opts.regionId,
      image: opts.imageId ?? "ubuntu-22.04",
      ssh_keys: [Number(keyResult.id)],
      start_after_create: true,
      labels: Object.fromEntries(opts.tags.map((t) => [t.replace(/[^a-z0-9-]/gi, "-"), "1"])),
    };
    const res = await hcloud<{ server: HServer }>("/servers", { method: "POST", body });
    return {
      providerId: String(res.server.id),
      ipv4: res.server.public_net.ipv4?.ip ?? null,
      ipv6: res.server.public_net.ipv6?.ip ?? null,
    };
  },

  async destroyServer(providerId: string): Promise<void> {
    await hcloud(`/servers/${providerId}`, { method: "DELETE" });
  },

  async waitReady(providerId: string, timeoutMs = 10 * 60_000): Promise<{ ipv4: string | null; ipv6: string | null }> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await hcloud<{ server: HServer }>(`/servers/${providerId}`);
      if (res.server.status === "running") {
        return {
          ipv4: res.server.public_net.ipv4?.ip ?? null,
          ipv6: res.server.public_net.ipv6?.ip ?? null,
        };
      }
      await new Promise((r) => setTimeout(r, 4_000));
    }
    throw new Error(`Hetzner server ${providerId} did not reach running state within ${timeoutMs}ms`);
  },
};

void (null as unknown as HcloudListResponse<unknown>);
