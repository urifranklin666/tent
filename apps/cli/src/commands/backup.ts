import kleur from "kleur";
import { SiteService, registerAllHandlers } from "@tent/core";
import { tailJob } from "../ui/tail.js";

export async function cmdBackupRun(input: string, options: { wait?: boolean } = { wait: true }): Promise<void> {
  registerAllHandlers();

  const site =
    (await SiteService.getBySlug(input)) ??
    (await SiteService.getByDomain(input)) ??
    (await SiteService.get(input));
  if (!site) {
    console.error(kleur.red(`no site matching "${input}"`));
    process.exit(1);
  }
  if (site.status === "destroyed" || site.status === "destroying") {
    console.error(kleur.red(`site "${site.domain}" is ${site.status}; cannot back up`));
    process.exit(1);
  }

  const { jobId } = await SiteService.backup(site.id);
  console.log(kleur.cyan(`enqueued backup for ${site.domain} (job ${jobId})`));

  if (options.wait === false) return;
  const job = await tailJob(jobId);
  if (job.state !== "succeeded") {
    console.error(kleur.red(`backup did not complete cleanly: ${job.state}`));
    process.exit(1);
  }
}
