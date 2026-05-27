import { cfCall } from "./client.js";

export interface CfDnsRecord {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  ttl: number;
  comment?: string;
}

export interface CreateDnsInput {
  zoneId: string;
  type: "A" | "AAAA" | "CNAME" | "TXT";
  name: string;
  content: string;
  proxied?: boolean;
  ttl?: number;
  comment?: string;
}

export async function createDnsRecord(input: CreateDnsInput): Promise<CfDnsRecord> {
  const body: Record<string, unknown> = {
    type: input.type,
    name: input.name,
    content: input.content,
    proxied: input.proxied ?? false,
    ttl: input.ttl ?? 1,
  };
  if (input.comment) body.comment = input.comment;
  return cfCall<CfDnsRecord>(`/zones/${input.zoneId}/dns_records`, {
    method: "POST",
    body,
  });
}

export async function deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
  await cfCall<{ id: string }>(`/zones/${zoneId}/dns_records/${recordId}`, {
    method: "DELETE",
  });
}

export async function listDnsRecords(zoneId: string, name?: string): Promise<CfDnsRecord[]> {
  const query: Record<string, string | number> = { per_page: 100 };
  if (name) query.name = name;
  return cfCall<CfDnsRecord[]>(`/zones/${zoneId}/dns_records`, { query });
}
