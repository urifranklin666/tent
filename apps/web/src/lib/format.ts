import type { ServerStatus, SiteStatus, JobState } from "@tent/core";

export function serverStatusTone(s: ServerStatus): "good" | "warn" | "bad" | "muted" {
  if (s === "ready") return "good";
  if (s === "destroyed") return "muted";
  if (s === "degraded" || s === "destroying") return "bad";
  return "warn";
}

export function siteStatusTone(s: SiteStatus): "good" | "warn" | "bad" | "muted" {
  if (s === "live") return "good";
  if (s === "destroyed") return "muted";
  if (s === "error" || s === "destroying") return "bad";
  return "warn";
}

export function jobStateTone(s: JobState): "good" | "warn" | "bad" | "muted" {
  if (s === "succeeded") return "good";
  if (s === "running" || s === "queued") return "warn";
  if (s === "failed") return "bad";
  return "muted";
}

export function shortDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().replace("T", " ").slice(0, 16);
}

export function relativeTime(d: Date | null | undefined): string {
  if (!d) return "—";
  const diffMs = Date.now() - d.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago`;
}
