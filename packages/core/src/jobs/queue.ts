import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { jobs, type Job } from "../db/schema.js";
import { newId, type JobProgressEvent } from "@tent/shared";

export interface EnqueueInput {
  kind: string;
  params: unknown;
  createdBy?: string | null;
  maxAttempts?: number;
}

export async function enqueueJob(input: EnqueueInput): Promise<{ id: string }> {
  const id = newId("job");
  await getDb()
    .insert(jobs)
    .values({
      id,
      kind: input.kind,
      params: input.params as never,
      createdBy: input.createdBy ?? null,
      maxAttempts: input.maxAttempts ?? 3,
    });
  return { id };
}

/**
 * Atomically claim the next queued job. Returns the row or null if none available.
 * Uses `SELECT ... FOR UPDATE SKIP LOCKED` inside a transaction so multiple workers
 * can poll concurrently without colliding.
 */
export async function claimNextJob(): Promise<Job | null> {
  const db = getDb();
  return db.transaction(async (tx) => {
    const candidate = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(eq(jobs.state, "queued"))
      .orderBy(jobs.createdAt)
      .limit(1)
      .for("update", { skipLocked: true });

    const head = candidate[0];
    if (!head) return null;

    const updated = await tx
      .update(jobs)
      .set({
        state: "running",
        claimedAt: new Date(),
        attempts: sql`${jobs.attempts} + 1`,
      })
      .where(eq(jobs.id, head.id))
      .returning();

    return updated[0] ?? null;
  });
}

export async function appendProgress(jobId: string, event: JobProgressEvent): Promise<void> {
  await getDb()
    .update(jobs)
    .set({
      progress: sql`progress || ${JSON.stringify([event])}::jsonb`,
    })
    .where(eq(jobs.id, jobId));
}

export async function markSucceeded(jobId: string, result: unknown): Promise<void> {
  await getDb()
    .update(jobs)
    .set({
      state: "succeeded",
      finishedAt: new Date(),
      result: result as never,
    })
    .where(eq(jobs.id, jobId));
}

export async function markFailed(jobId: string, error: string): Promise<void> {
  await getDb()
    .update(jobs)
    .set({
      state: "failed",
      finishedAt: new Date(),
      error,
    })
    .where(eq(jobs.id, jobId));
}

export async function requeueForRetry(jobId: string, error: string): Promise<void> {
  await getDb()
    .update(jobs)
    .set({
      state: "queued",
      claimedAt: null,
      error,
    })
    .where(eq(jobs.id, jobId));
}

export async function getJob(jobId: string): Promise<Job | null> {
  const rows = await getDb().select().from(jobs).where(eq(jobs.id, jobId)).limit(1);
  return rows[0] ?? null;
}
