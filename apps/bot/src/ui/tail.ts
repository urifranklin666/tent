import type { ChatInputCommandInteraction } from "discord.js";
import { getJob, type JobProgressEvent, type JobState } from "@tent/core";

const POLL_MS = 1200;
const MAX_DURATION_MS = 30 * 60 * 1000;
const MSG_BUDGET = 1800;
const TERMINAL = new Set<JobState>(["succeeded", "failed", "canceled"]);

/**
 * Polls a job and edits the deferred reply with rolling progress events
 * until the job hits a terminal state or MAX_DURATION_MS elapses.
 *
 * Assumes the caller already called interaction.deferReply().
 */
export async function tailJobIntoInteraction(
  interaction: ChatInputCommandInteraction,
  jobId: string,
  opts: { title: string },
): Promise<JobState | "timeout"> {
  const started = Date.now();
  let lastRender = "";

  while (Date.now() - started < MAX_DURATION_MS) {
    const job = await getJob(jobId);
    if (!job) {
      await interaction.editReply(`✗ job ${jobId} disappeared`);
      return "failed";
    }

    const body = render(opts.title, jobId, job.state, job.progress ?? [], job.error);
    if (body !== lastRender) {
      await interaction.editReply(body);
      lastRender = body;
    }

    if (TERMINAL.has(job.state)) return job.state;
    await sleep(POLL_MS);
  }

  await interaction.editReply(lastRender + "\n— stopped tailing after 30 min —");
  return "timeout";
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

  const lines = events.map(paint);
  // Trim the head of the list so we fit in the Discord message budget.
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
