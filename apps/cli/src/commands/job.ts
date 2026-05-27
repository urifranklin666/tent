import kleur from "kleur";
import { getDb, jobs } from "@tent/core";
import { desc } from "drizzle-orm";
import { tailJob } from "../ui/tail.js";

export async function cmdJobTail(id: string): Promise<void> {
  await tailJob(id);
}

export async function cmdJobList(): Promise<void> {
  const rows = await getDb().select().from(jobs).orderBy(desc(jobs.createdAt)).limit(20);
  if (rows.length === 0) {
    console.log(kleur.dim("no jobs yet"));
    return;
  }
  for (const j of rows) {
    const state =
      j.state === "succeeded" ? kleur.green(j.state)
        : j.state === "failed" ? kleur.red(j.state)
          : j.state === "running" ? kleur.cyan(j.state)
            : kleur.yellow(j.state);
    console.log(`${kleur.dim(j.id)}  ${j.kind.padEnd(20)}  ${state}  ${j.createdAt.toISOString()}`);
  }
}
