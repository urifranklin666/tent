import { z } from "zod";
import { ServerProvider } from "./enums.js";

export const Region = z.object({
  id: z.string(),
  label: z.string(),
  country: z.string().optional(),
  city: z.string().optional(),
});
export type Region = z.infer<typeof Region>;

export const Size = z.object({
  id: z.string(),
  label: z.string(),
  cpuCores: z.number().int().positive(),
  memoryMb: z.number().int().positive(),
  diskGb: z.number().int().positive(),
  monthlyPriceUsd: z.number().nonnegative(),
});
export type Size = z.infer<typeof Size>;

export const Image = z.object({
  id: z.string(),
  label: z.string(),
  os: z.string(),
  version: z.string(),
});
export type Image = z.infer<typeof Image>;

export const CreatedServer = z.object({
  providerId: z.string(),
  ipv4: z.string().nullable(),
  ipv6: z.string().nullable(),
});
export type CreatedServer = z.infer<typeof CreatedServer>;

export const ProvisionOptions = z.object({
  provider: ServerProvider,
  name: z.string().min(1).max(64),
  regionId: z.string(),
  sizeId: z.string(),
  imageId: z.string().optional(),
  sshPublicKey: z.string(),
  tags: z.array(z.string()).default([]),
});
export type ProvisionOptions = z.infer<typeof ProvisionOptions>;
