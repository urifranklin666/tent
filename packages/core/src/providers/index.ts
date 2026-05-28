import type { ServerProvider } from "@tent/shared";
import type { VpsProvider } from "./base.js";
import { selfhostedProvider } from "./selfhosted.js";
import { hetznerProvider } from "./hetzner.js";
import { digitaloceanProvider } from "./digitalocean.js";
import { vultrProvider } from "./vultr.js";

const registry = new Map<ServerProvider, VpsProvider>();
registry.set("selfhosted", selfhostedProvider);
registry.set("hetzner", hetznerProvider);
registry.set("digitalocean", digitaloceanProvider);
registry.set("vultr", vultrProvider);

export function registerProvider(provider: VpsProvider): void {
  registry.set(provider.id, provider);
}

export function getProvider(id: ServerProvider): VpsProvider {
  const p = registry.get(id);
  if (!p) {
    throw new Error(`No provider registered for "${id}". Did you forget to import its module?`);
  }
  return p;
}

export function listProviders(): ServerProvider[] {
  return Array.from(registry.keys());
}

export * from "./base.js";
