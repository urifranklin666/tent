import { request } from "undici";
import { getEnv } from "../env.js";

export class CloudflareError extends Error {
  constructor(
    public status: number,
    public errors: Array<{ code: number; message: string }>,
    message: string,
  ) {
    super(message);
    this.name = "CloudflareError";
  }
}

interface CfApiSuccess<T> {
  success: true;
  result: T;
  result_info?: { count: number; page: number; per_page: number; total_count: number };
}

interface CfApiFailure {
  success: false;
  errors: Array<{ code: number; message: string }>;
}

type CfApiResponse<T> = CfApiSuccess<T> | CfApiFailure;

export interface CallOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

export async function cfCall<T>(path: string, opts: CallOptions = {}): Promise<T> {
  const env = getEnv();
  if (!env.CLOUDFLARE_API_TOKEN) {
    throw new Error("CLOUDFLARE_API_TOKEN is required for this operation.");
  }

  const url = new URL(`https://api.cloudflare.com/client/v4${path}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const init: { method: string; headers: Record<string, string>; body?: string } = {
    method: opts.method ?? "GET",
    headers,
  };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
  }

  const res = await request(url.toString(), init);
  const text = await res.body.text();
  let parsed: CfApiResponse<T>;
  try {
    parsed = JSON.parse(text) as CfApiResponse<T>;
  } catch {
    throw new CloudflareError(res.statusCode, [], `Non-JSON response from Cloudflare (status ${res.statusCode}): ${text.slice(0, 200)}`);
  }

  if (!parsed.success) {
    const msg = parsed.errors.map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new CloudflareError(res.statusCode, parsed.errors, `Cloudflare API error: ${msg}`);
  }

  return parsed.result;
}

export function cfAccountId(): string {
  const env = getEnv();
  if (!env.CLOUDFLARE_ACCOUNT_ID) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is required for this operation.");
  }
  return env.CLOUDFLARE_ACCOUNT_ID;
}
