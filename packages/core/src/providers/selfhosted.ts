import type { VpsProvider } from "./base.js";
import type {
  ProvisionOptions,
  CreatedServer,
  Region,
  Size,
  Image,
} from "@tent/shared";

/**
 * The self-hosted provider is a no-op for provisioning: the operator brings their own server
 * and just registers it with `tent server add --provider selfhosted --host <ip> ...`.
 * It exists so that the rest of the engine can treat all servers uniformly.
 */
export const selfhostedProvider: VpsProvider = {
  id: "selfhosted",

  async listRegions(): Promise<Region[]> {
    return [{ id: "byo", label: "wherever your box is" }];
  },

  async listSizes(): Promise<Size[]> {
    return [
      {
        id: "byo",
        label: "whatever you have",
        cpuCores: 0,
        memoryMb: 0,
        diskGb: 0,
        monthlyPriceUsd: 0,
      },
    ];
  },

  async listImages(): Promise<Image[]> {
    return [{ id: "byo", label: "whatever you installed", os: "ubuntu", version: "22.04+" }];
  },

  async ensureSshKey(): Promise<{ id: string }> {
    // tent generates a keypair per server; the operator copies the public key onto their box.
    return { id: "byo" };
  },

  async createServer(_opts: ProvisionOptions): Promise<CreatedServer> {
    throw new Error(
      "Cannot provision a self-hosted server. Use `tent server add --provider selfhosted --host <ip>` to attach an existing one.",
    );
  },

  async destroyServer(): Promise<void> {
    // No-op: tent does not own the hardware.
  },

  async waitReady(): Promise<{ ipv4: string | null; ipv6: string | null }> {
    throw new Error("waitReady is not meaningful for self-hosted servers.");
  },
};
