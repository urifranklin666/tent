import type { ChatInputCommandInteraction } from "discord.js";
import { getJob, type JobProgressEvent, type JobState } from "@tent/core";

const POLL_MS = 1200;
// Discord webhook tokens expire 15 min after the interaction. Stop tailing
// just shy of that so the final editReply succeeds.
const MAX_DURATION_MS = 14 * 60 * 1000 + 30 * 1000;
const MSG_BUDGET = 1800;
const LINE_BUDGET = 240; // per-line cap so the trim loop always converges
const TERMINAL = new Set<JobState>(["succeeded", "failed", "canceled"]);

/**
 * Polls a job and edits the deferred reply with rolling progress events
 * until the job hits a terminal state or the webhook token nears expiry.
 *
 * Assumes the caller already called interaction.deferReply().
 */
export async function tailJobIntoInteraction(
  interaction: ChatInputCommandInteraction,
  jobId: string,
  opts: { title: string },
): Promise<JobState | "timeout" | "lost"> {
  const started = Date.now();
  let lastRender = "";

  while (Date.now() - started < MAX_DURATION_MS) {
    const job = await getJob(jobId);
    if (!job) {
      await safeEdit(interaction, `✗ job ${jobId} disappeared`);
      return "failed";
    }

    const body = render(opts.title, jobId, job.state, job.progress ?? [], job.error);
    if (body !== lastRender) {
      const ok = await safeEdit(interaction, body);
      if (!ok) return "lost"; // webhook token dead — stop tailing
      lastRender = body;
    }

    if (TERMINAL.has(job.state)) return job.state;
    await sleep(POLL_MS);
  }

  await safeEdit(
    interaction,
    lastRender + "\n— stopped tailing; check `/tent-list` for final state —",
  );
  return "timeout";
}

async function safeEdit(
  interaction: ChatInputCommandInteraction,
  content: string,
): Promise<boolean> {
  try {
    await interaction.editReply(content);
    return true;
  } catch {
    return false;
  }
}

function render(
  title: string,
  jobId: string,
  state: JobState,
  events: JobProgressEvent[],
  error: string | null,
): string {
  const head =
    `**${title}** · \`${jobId.slice(0, 14)}…\` · ` +
    (state === "succeeded" ? "✓ succeeded" :
     state === "failed" ? "✗ failed" :
     state === "canceled" ? "○ canceled" :
     state === "running" ? "▸ running" :
     "· queued");

  if (events.length === 0) {
    return head + "\n```\nwaiting for output…\n```";
  }

  // Cap individual lines first so a single huge stdout chunk can't blow the
  // budget on its own. Then trim the head of the list to fit the rest.
  const lines = events.map((ev) => truncate(paint(ev), LINE_BUDGET));
  let body = lines.join("\n");
  if (body.length > MSG_BUDGET) {
    while (body.length > MSG_BUDGET && lines.length > 1) {
      lines.shift();
      body = lines.join("\n");
    }
    body = "… (older output trimmed)\n" + body;
  }

  const tail = error ? `\n**error:** \`${truncate(error, 200)}\`` : "";
  return head + "\n```\n" + body + "\n```" + tail;
}

function paint(ev: JobProgressEvent): string {
  switch (ev.kind) {
    case "error":
    case "stderr":   return `✗ ${ev.message}`;
    case "warn":     return `! ${ev.message}`;
    case "step.start": return `▸ ${ev.message}`;
    case "step.end":   return `✓ ${ev.message}`;
    case "result":     return `◆ ${ev.message}`;
    case "info":       return `· ${ev.message}`;
    case "stdout":     return `  ${ev.message}`;
    default:           return `  ${ev.message}`;
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + "…";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
