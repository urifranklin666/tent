import { SlashCommandBuilder } from "discord.js";
import { sql } from "drizzle-orm";
import { getDb, jobs, ServerService, SiteService } from "@tent/core";
import type { TentCommand } from "./types.js";

export const statusCommand: TentCommand = {
  minRole: "viewer",
  data: new SlashCommandBuilder()
    .setName("tent-status")
    .setDescription("show counts of servers, sites, and jobs"),

  async run({ interaction }) {
    const db = getDb();
    const [servers, sites, jobRows] = await Promise.all([
      ServerService.list(),
      SiteService.list(),
      db
        .select({ state: jobs.state, n: sql<number>`count(*)::int` })
        .from(jobs)
        .groupBy(jobs.state),
    ]);

    const ready = servers.filter((s) => s.status === "ready").length;
    const live = sites.filter((s) => s.status === "live").length;
    const running = jobRows.find((j) => j.state === "running")?.n ?? 0;
    const queued = jobRows.find((j) => j.state === "queued")?.n ?? 0;
    const failed = jobRows.find((j) => j.state === "failed")?.n ?? 0;

    const body = [
      "```",
      `servers:  ${servers.length}  (${ready} ready)`,
      `sites:    ${sites.length}  (${live} live)`,
      `jobs:     ${running} running, ${queued} queued, ${failed} failed`,
      "```",
    ].join("\n");

    await interaction.editReply(body);
  },
};
