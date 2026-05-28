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

const DO_BASE = "https://api.digitalocean.com/v2";

interface DoRegion {
  name: string;
  slug: string;
  available: boolean;
  sizes: string[];
}
interface DoSize {
  slug: string;
  description: string;
  vcpus: number;
  memory: number; // MB
  disk: number; // GB
  price_monthly: number;
  available: boolean;
  regions: string[];
}
interface DoImage {
  id: number;
  name: string;
  distribution: string;
  slug: string | null;
  type: string;
  status: string;
}
interface DoSshKey {
  id: number;
  name: string;
  public_key: string;
  fingerprint: string;
}
interface DoDroplet {
  id: number;
  name: string;
  status: string;
  networks: {
    v4: Array<{ ip_address: string; type: string }>;
    v6: Array<{ ip_address: string; type: string }>;
  };
}

function token(): string {
  const t = getEnv().DIGITALOCEAN_API_TOKEN;
  if (!t) throw new ProviderNotConfiguredError("digitalocean", "DIGITALOCEAN_API_TOKEN");
  return t;
}

async function doApi<T>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const url = new URL(DO_BASE + path);
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
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.body.text();
  if (res.statusCode >= 400) {
    throw new Error(
      `DigitalOcean API ${init.method ?? "GET"} ${path} → ${res.statusCode}: ${text.slice(0, 400)}`,
    );
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const digitaloceanProvider: VpsProvider = {
  id: "digitalocean",

  async listRegions(): Promise<Region[]> {
    const res = await doApi<{ regions: DoRegion[] }>("/regions", { query: { per_page: 100 } });
    return res.regions
      .filter((r) => r.available)
      .map((r) => ({ id: r.slug, label: `${r.name} (${r.slug})` }));
  },

  async listSizes(regionId?: string): Promise<Size[]> {
    const res = await doApi<{ sizes: DoSize[] }>("/sizes", { query: { per_page: 200 } });
    return res.sizes
      .filter((s) => s.available && (!regionId || s.regions.includes(regionId)))
      .map((s) => ({
        id: s.slug,
        label: `${s.slug} — ${s.description}`,
        cpuCores: s.vcpus,
        memoryMb: s.memory,
        diskGb: s.disk,
        monthlyPriceUsd: s.price_monthly,
      }));
  },

  async listImages(): Promise<Image[]> {
    const res = await doApi<{ images: DoImage[] }>("/images", {
      query: { type: "distribution", per_page: 100 },
    });
    return res.images
      .filter((i) => i.slug && i.status === "available")
      .map((i) => ({
        id: i.slug as string,
        label: `${i.distribution} (${i.name})`,
        os: i.distribution,
        version: i.name,
      }));
  },

  async ensureSshKey(name: string, publicKey: string): Promise<{ id: string }> {
    const list = await doApi<{ ssh_keys: DoSshKey[] }>("/account/keys", { query: { per_page: 200 } });
    const existing = list.ssh_keys.find((k) => k.name === name);
    if (existing) {
      if (existing.public_key.trim() !== publicKey.trim()) {
        await doApi(`/account/keys/${existing.id}`, { method: "DELETE" });
      } else {
        return { id: String(existing.id) };
      }
    }
    const created = await doApi<{ ssh_key: DoSshKey }>("/account/keys", {
      method: "POST",
      body: { name, public_key: publicKey },
    });
    return { id: String(created.ssh_key.id) };
  },

  async createServer(opts: ProvisionOptions): Promise<CreatedServer> {
    const keyResult = await this.ensureSshKey(`tent-${opts.name}`, opts.sshPublicKey);
    const body: Record<string, unknown> = {
      name: opts.name,
      region: opts.regionId,
      size: opts.sizeId,
      image: opts.imageId ?? "ubuntu-22-04-x64",
      ssh_keys: [Number(keyResult.id)],
      tags: opts.tags.map((t) => t.replace(/[^a-z0-9-]/gi, "-")),
      ipv6: true,
    };
    const res = await doApi<{ droplet: DoDroplet }>("/droplets", { method: "POST", body });
    return {
      providerId: String(res.droplet.id),
      ipv4: res.droplet.networks.v4.find((n) => n.type === "public")?.ip_address ?? null,
      ipv6: res.droplet.networks.v6.find((n) => n.type === "public")?.ip_address ?? null,
    };
  },

  async destroyServer(providerId: string): Promise<void> {
    await doApi(`/droplets/${providerId}`, { method: "DELETE" });
  },

  async waitReady(providerId: string, timeoutMs = 10 * 60_000): Promise<{ ipv4: string | null; ipv6: string | null }> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await doApi<{ droplet: DoDroplet }>(`/droplets/${providerId}`);
      if (res.droplet.status === "active") {
        return {
          ipv4: res.droplet.networks.v4.find((n) => n.type === "public")?.ip_address ?? null,
          ipv6: res.droplet.networks.v6.find((n) => n.type === "public")?.ip_address ?? null,
        };
      }
      await new Promise((r) => setTimeout(r, 4_000));
    }
    throw new Error(`DigitalOcean droplet ${providerId} did not become active within ${timeoutMs}ms`);
  },
};
