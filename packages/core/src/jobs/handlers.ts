import type { JobHandler } from "./types.js";

const registry = new Map<string, JobHandler>();

export function registerJobHandler(kind: string, handler: JobHandler): void {
  if (registry.has(kind)) {
    throw new Error(`Job handler for "${kind}" is already registered.`);
  }
  registry.set(kind, handler);
}

export function getJobHandler(kind: string): JobHandler | undefined {
  return registry.get(kind);
}

export function listJobKinds(): string[] {
  return Array.from(registry.keys());
}
