import { registerServerProvisionHandler } from "./server-provision.js";
import { registerServerBootstrapHandler } from "./server-bootstrap.js";
import { registerServerDestroyHandler } from "./server-destroy.js";
import { registerSiteDeployHandler } from "./site-deploy.js";
import { registerSiteDestroyHandler } from "./site-destroy.js";
import { registerSiteBackupHandler } from "./site-backup.js";

let registered = false;

/**
 * Idempotent. Call once at process startup (CLI commands, worker, web routes that enqueue).
 */
export function registerAllHandlers(): void {
  if (registered) return;
  registered = true;
  registerServerProvisionHandler();
  registerServerBootstrapHandler();
  registerServerDestroyHandler();
  registerSiteDeployHandler();
  registerSiteDestroyHandler();
  registerSiteBackupHandler();
}
