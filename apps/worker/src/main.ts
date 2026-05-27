import { registerAllHandlers, runWorkerLoop, syncTemplates, logger } from "@tent/core";

async function main() {
  registerAllHandlers();
  const count = await syncTemplates();
  logger.info("templates synced", { count });

  const controller = new AbortController();
  const onSignal = () => {
    logger.info("signal received, draining worker");
    controller.abort();
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);

  await runWorkerLoop({ signal: controller.signal });
  process.exit(0);
}

main().catch((err) => {
  logger.error("worker crashed", { err: String(err), stack: err instanceof Error ? err.stack : undefined });
  process.exit(1);
});
