import kleur from "kleur";
import { registerAllHandlers, runWorkerLoop, syncTemplates, logger } from "@tent/core";

export async function cmdWorker(): Promise<void> {
  console.log(kleur.bold().red("tent worker") + kleur.dim(" — Ctrl-C to stop"));
  registerAllHandlers();
  const count = await syncTemplates();
  logger.info("templates synced", { count });

  const controller = new AbortController();
  process.once("SIGINT", () => {
    console.log("\n" + kleur.yellow("draining…"));
    controller.abort();
  });
  process.once("SIGTERM", () => controller.abort());

  await runWorkerLoop({ signal: controller.signal });
}
