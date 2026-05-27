import type {
  ProvisionOptions,
  CreatedServer,
  Region,
  Size,
  Image,
  ServerProvider,
} from "@tent/shared";

export interface VpsProvider {
  readonly id: ServerProvider;

  listRegions(): Promise<Region[]>;
  listSizes(regionId?: string): Promise<Size[]>;
  listImages(): Promise<Image[]>;

  /** Upload the SSH public key. Idempotent on name. Returns provider key id. */
  ensureSshKey(name: string, publicKey: string): Promise<{ id: string }>;

  createServer(opts: ProvisionOptions): Promise<CreatedServer>;
  destroyServer(providerId: string): Promise<void>;

  /** Wait until the cloud provider reports the VM as up and SSH-ready. */
  waitReady(providerId: string, timeoutMs?: number): Promise<{ ipv4: string | null; ipv6: string | null }>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: ServerProvider, envVar: string) {
    super(`Provider "${provider}" requires ${envVar} to be set in the environment.`);
    this.name = "ProviderNotConfiguredError";
  }
}
