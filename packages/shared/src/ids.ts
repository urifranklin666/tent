import { customAlphabet } from "nanoid";

// Lowercase alphanumeric, 21 chars — collision-resistant for our scale.
// Prefixes make IDs self-describing in logs and DB rows.
const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
const nano = customAlphabet(alphabet, 21);

export const idPrefixes = {
  server: "svr",
  site: "site",
  template: "tmpl",
  job: "job",
  secret: "sec",
  user: "usr",
  audit: "aud",
  sshKey: "key",
} as const;

export type IdKind = keyof typeof idPrefixes;

export function newId(kind: IdKind): string {
  return `${idPrefixes[kind]}_${nano()}`;
}

export function isId(kind: IdKind, value: string): boolean {
  return value.startsWith(`${idPrefixes[kind]}_`) && value.length === idPrefixes[kind].length + 1 + 21;
}
