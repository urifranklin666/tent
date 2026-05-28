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

const VULTR_BASE = "https://api.vultr.com/v2";

interface VRegion {
  id: string;
  city: string;
  country: string;
  continent: string;
  options: string[];
}
interface VPlan {
  id: string;
  vcpu_count: number;
  ram: number; // MB
  disk: number; // GB
  monthly_cost: number;
  type: string;
  locations: string[];
}
interface VOs {
  id: number;
  name: string;
  arch: string;
  family: string;
}
interface VSshKey {
  id: string;
  name: string;
  ssh_key: string;
}
interface VInstance {
  id: string;
  status: string; // pending, active, suspended, ...
  power_status: string; // running, stopped, ...
  server_status: string; // none, locked, installingbooting, ok
  main_ip: string;
  v6_main_ip: string;
}

function token(): string {
  const t = getEnv().VULTR_API_KEY;
  if (!t) throw new ProviderNotConfiguredError("vultr", "VULTR_API_KEY");
  return t;
}

async function vultrApi<T>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const url = new URL(VULTR_BASE + path);
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
      `Vultr API ${init.method ?? "GET"} ${path} → ${res.statusCode}: ${text.slice(0, 400)}`,
    );
  }
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const vultrProvider: VpsProvider = {
  id: "vultr",

  async listRegions(): Promise<Region[]> {
    const res = await vultrApi<{ regions: VRegion[] }>("/regions", { query: { per_page: 500 } });
    return res.regions.map((r) => ({
      id: r.id,
      label: `${r.city}, ${r.country} (${r.id})`,
      country: r.country,
      city: r.city,
    }));
  },

  async listSizes(regionId?: string): Promise<Size[]> {
    const res = await vultrApi<{ plans: VPlan[] }>("/plans", { query: { per_page: 500 } });
    return res.plans
      .filter((p) => !regionId || p.locations.includes(regionId))
      .map((p) => ({
        id: p.id,
        label: `${p.id} — ${p.vcpu_count}c / ${(p.ram / 1024).toFixed(0)}gb`,
        cpuCores: p.vcpu_count,
        memoryMb: p.ram,
        diskGb: p.disk,
        monthlyPriceUsd: p.monthly_cost,
      }));
  },

  async listImages(): Promise<Image[]> {
    const res = await vultrApi<{ os: VOs[] }>("/os", { query: { per_page: 500 } });
    return res.os
      .filter((o) => /ubuntu|debian/i.test(o.family))
      .map((o) => ({
        id: String(o.id),
        label: `${o.name} (${o.arch})`,
        os: o.family,
        version: o.name,
      }));
  },

  async ensureSshKey(name: string, publicKey: string): Promise<{ id: string }> {
    const list = await vultrApi<{ ssh_keys: VSshKey[] }>("/ssh-keys", { query: { per_page: 500 } });
    const existing = list.ssh_keys.find((k) => k.name === name);
    if (existing) {
      if (existing.ssh_key.trim() !== publicKey.trim()) {
        await vultrApi(`/ssh-keys/${existing.id}`, { method: "DELETE" });
      } else {
        return { id: existing.id };
      }
    }
    const created = await vultrApi<{ ssh_key: VSshKey }>("/ssh-keys", {
      method: "POST",
      body: { name, ssh_key: publicKey },
    });
    return { id: created.ssh_key.id };
  },

  async createServer(opts: ProvisionOptions): Promise<CreatedServer> {
    const keyResult = await this.ensureSshKey(`tent-${opts.name}`, opts.sshPublicKey);
    // Vultr's default Ubuntu 22.04 LTS x64 os_id is 1743 — let the operator override via imageId.
    const osId = opts.imageId ? Number(opts.imageId) : 1743;
    const body: Record<string, unknown> = {
      region: opts.regionId,
      plan: opts.sizeId,
      os_id: osId,
      label: opts.name,
      hostname: opts.name,
      sshkey_id: [keyResult.id],
      enable_ipv6: true,
      tags: opts.tags.map((t) => t.replace(/[^a-z0-9-]/gi, "-")).slice(0, 5),
    };
    const res = await vultrApi<{ instance: VInstance }>("/instances", { method: "POST", body });
    return {
      providerId: res.instance.id,
      ipv4: res.instance.main_ip && res.instance.main_ip !== "0.0.0.0" ? res.instance.main_ip : null,
      ipv6: res.instance.v6_main_ip || null,
    };
  },

  async destroyServer(providerId: string): Promise<void> {
    await vultrApi(`/instances/${providerId}`, { method: "DELETE" });
  },

  async waitReady(providerId: string, timeoutMs = 10 * 60_000): Promise<{ ipv4: string | null; ipv6: string | null }> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const res = await vultrApi<{ instance: VInstance }>(`/instances/${providerId}`);
      if (res.instance.status === "active" && res.instance.server_status === "ok") {
        return {
          ipv4: res.instance.main_ip && res.instance.main_ip !== "0.0.0.0" ? res.instance.main_ip : null,
          ipv6: res.instance.v6_main_ip || null,
        };
      }
      await new Promise((r) => setTimeout(r, 4_000));
    }
    throw new Error(`Vultr instance ${providerId} did not become active within ${timeoutMs}ms`);
  },
};
