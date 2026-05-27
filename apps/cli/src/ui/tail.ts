import { getDb, jobs, type Job } from "@tent/core";
import { eq } from "drizzle-orm";
import kleur from "kleur";

const POLL_MS = 700;
const TERMINAL = new Set(["succeeded", "failed", "canceled"]);

function paintLine(kind: string, message: string): string {
  switch (kind) {
    case "error":
    case "stderr":
      return kleur.red(`✗ ${message}`);
    case "warn":
      return kleur.yellow(`! ${message}`);
    case "step.start":
      return kleur.cyan(`▸ ${message}`);
    case "step.end":
      return kleur.green(`✓ ${message}`);
    case "result":
      return kleur.green(`◆ ${message}`);
    case "info":
      return kleur.gray(`· ${message}`);
    case "stdout":
      return kleur.dim(`  ${message}`);
    default:
      return `  ${message}`;
  }
}

export async function tailJob(jobId: string): Promise<Job> {
  const db = getDb();
  let cursor = 0;

  while (true) {
    const rows = await db
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    const job = rows[0];
    if (!job) throw new Error(`Job ${jobId} not found.`);

    const events = job.progress ?? [];
    for (let i = cursor; i < events.length; i++) {
      const ev = events[i];
      if (ev) process.stdout.write(paintLine(ev.kind, ev.message) + "\n");
    }
    cursor = events.length;

    if (TERMINAL.has(job.state)) {
      const final = job.state === "succeeded"
        ? kleur.green().bold(`\njob ${jobId} ${job.state}`)
        : kleur.red().bold(`\njob ${jobId} ${job.state}: ${job.error ?? "(no error message)"}`);
      process.stdout.write(final + "\n");
      return job;
    }

    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
