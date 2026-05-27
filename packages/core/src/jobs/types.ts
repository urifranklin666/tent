import type { JobProgressEvent, JobKind } from "@tent/shared";

export interface JobContext {
  jobId: string;
  kind: string;
  params: unknown;
  attempt: number;
  emit: (event: JobProgressEvent) => Promise<void>;
  signal: AbortSignal;
}

export type JobHandler = (ctx: JobContext) => Promise<unknown>;

export interface RegisteredHandler {
  kind: JobKind | string;
  handler: JobHandler;
}
