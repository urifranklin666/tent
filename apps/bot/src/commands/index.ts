import type { TentCommand } from "./types.js";
import { statusCommand } from "./status.js";
import { listCommand } from "./list.js";
import { serverAddCommand } from "./server-add.js";
import { newSiteCommand } from "./new-site.js";
import { deployCommand } from "./deploy.js";

export const commands: TentCommand[] = [
  statusCommand,
  listCommand,
  serverAddCommand,
  newSiteCommand,
  deployCommand,
];
