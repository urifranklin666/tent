import { z } from "zod";

export const ProgressEventKind = z.enum([
  "info",
  "warn",
  "error",
  "step.start",
  "step.end",
  "stdout",
  "stderr",
  "result",
]);
export type ProgressEventKind = z.infer<typeof ProgressEventKind>;

export const JobProgressEvent = z.object({
  at: z.string(), // ISO 8601
  kind: ProgressEventKind,
  message: z.string(),
  step: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});
export type JobProgressEvent = z.infer<typeof JobProgressEvent>;

export function progressEvent(
  kind: ProgressEventKind,
  message: string,
  extra?: { step?: string; data?: Record<string, unknown> },
): JobProgressEvent {
  const event: JobProgressEvent = {
    at: new Date().toISOString(),
    kind,
    message,
  };
  if (extra?.step !== undefined) event.step = extra.step;
  if (extra?.data !== undefined) event.data = extra.data;
  return event;
}
