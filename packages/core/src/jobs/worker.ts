import { getEnv } from "../env.js";
import { logger } from "../logger.js";
import { progressEvent } from "@tent/shared";
import { getJobHandler } from "./handlers.js";
import { touchWorkerHeartbeat, notifyDiscord } from "../monitoring.js";
import {
  appendProgress,
  claimNextJob,
  markFailed,
  markSucceeded,
  requeueForRetry,
} from "./queue.js";

const IDLE_POLL_MS = 1_000;

interface WorkerOptions {
  concurrency?: number;
  signal?: AbortSignal;
}

/**
 * Run the job worker loop. Blocks forever (or until signal aborts).
 * Pulls from the queue with up to `concurrency` jobs in flight.
 */
export async function runWorkerLoop(opts: WorkerOptions = {}): Promise<void> {
  const concurrency = opts.concurrency ?? getEnv().TENT_WORKER_CONCURRENCY;
  const log = logger.child({ component: "worker" });
  log.info("worker starting", { concurrency });

  const inFlight = new Set<Promise<void>>();
  const abortSignal = opts.signal ?? new AbortController().signal;

  await touchWorkerHeartbeat();

  while (!abortSignal.aborted) {
    while (inFlight.size < concurrency) {
      const job = await claimNextJob();
      if (!job) break;
      const task = processJob(job.id, job.kind, job.params, job.attempts, abortSignal)
        .catch((err) => log.error("job runner crashed", { jobId: job.id, err: String(err) }))
        .finally(() => {
          inFlight.delete(task);
        });
      inFlight.add(task);
    }
    await touchWorkerHeartbeat();
    if (inFlight.size === 0) {
      await sleep(IDLE_POLL_MS, abortSignal);
    } else {
      await Promise.race([...inFlight, sleep(IDLE_POLL_MS, abortSignal)]);
    }
  }

  log.info("worker draining", { inFlight: inFlight.size });
  await Promise.allSettled([...inFlight]);
  log.info("worker stopped");
}

async function processJob(
  jobId: string,
  kind: string,
  params: unknown,
  attempt: number,
  parentSignal: AbortSignal,
): Promise<void> {
  const log = logger.child({ component: "worker", jobId, kind });
  log.info("job started", { attempt });
  await appendProgress(jobId, progressEvent("info", `job ${kind} started (attempt ${attempt})`));

  const handler = getJobHandler(kind);
  if (!handler) {
    const msg = `No handler registered for job kind "${kind}".`;
    await appendProgress(jobId, progressEvent("error", msg));
    await markFailed(jobId, msg);
    log.error("no handler", {});
    return;
  }

  const ctl = new AbortController();
  const onParent = () => ctl.abort();
  parentSignal.addEventListener("abort", onParent, { once: true });

  try {
    const result = await handler({
      jobId,
      kind,
      params,
      attempt,
      emit: (e) => appendProgress(jobId, e),
      signal: ctl.signal,
    });
    await appendProgress(jobId, progressEvent("result", "job succeeded"));
    await markSucceeded(jobId, result ?? null);
    log.info("job succeeded", {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    await appendProgress(
      jobId,
      progressEvent("error", message, stack ? { data: { stack } } : undefined),
    );
    // Retry policy: retry up to maxAttempts, then mark failed. attempts is already incremented.
    // We need to know maxAttempts to decide — re-query is simplest, but the worker increments
    // attempts pre-flight, so attempt N means we've used N tries already.
    // For now: if attempt < 3, requeue; else fail. The handler can opt out of retries by throwing
    // a JobNonRetryableError (added in a later phase if needed).
    if (attempt < 3) {
      await requeueForRetry(jobId, message);
      log.warn("job failed, requeued", { attempt });
    } else {
      await markFailed(jobId, message);
      log.error("job failed permanently", { attempt });
      void notifyDiscord(
        `✗ job \`${kind}\` failed after ${attempt} attempts\n` +
          `job id: \`${jobId}\`\n` +
          `error: ${message.slice(0, 800)}`,
      );
    }
  } finally {
    parentSignal.removeEventListener("abort", onParent);
  }
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return;
  await new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}
