import type { ServerProvider } from "@tent/shared";
import type { VpsProvider } from "./base.js";
import { selfhostedProvider } from "./selfhosted.js";

const registry = new Map<ServerProvider, VpsProvider>();
registry.set("selfhosted", selfhostedProvider);

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
