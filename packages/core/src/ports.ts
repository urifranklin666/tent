import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "./db/index.js";
import { sites } from "./db/schema.js";

const PORT_RANGE_START = 8000;
const PORT_RANGE_END = 8999;

/**
 * Allocate the lowest unused TCP port in [8000, 8999] for the given server.
 * Idempotent if a port is already assigned to the calling site (caller passes its own slug to exclude).
 */
export async function allocateSitePort(serverId: string, excludeSiteId?: string): Promise<number> {
  const rows = await getDb()
    .select({ id: sites.id, port: sites.livePort })
    .from(sites)
    .where(and(eq(sites.serverId, serverId), isNotNull(sites.livePort)));

  const used = new Set<number>();
  for (const r of rows) {
    if (r.id === excludeSiteId) continue;
    if (r.port !== null) used.add(r.port);
  }

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (!used.has(port)) return port;
  }
  throw new Error(`No free port available on server ${serverId} (range ${PORT_RANGE_START}-${PORT_RANGE_END} exhausted)`);
}
