import { desc, sql } from "drizzle-orm";
import {
  getDb,
  servers,
  sites,
  jobs,
  auditLog,
  ServerService,
  SiteService,
} from "@tent/core";

async function getStats() {
  const db = getDb();
  const [allServers, allSites] = await Promise.all([
    ServerService.list(),
    SiteService.list(),
  ]);
  const jobCounts = await db
    .select({
      state: jobs.state,
      n: sql<number>`count(*)::int`,
    })
    .from(jobs)
    .groupBy(jobs.state);

  return {
    serversTotal: allServers.length,
    serversReady: allServers.filter((s) => s.status === "ready").length,
    sitesTotal: allSites.length,
    sitesLive: allSites.filter((s) => s.status === "live").length,
    jobsRunning: jobCounts.find((j) => j.state === "running")?.n ?? 0,
    jobsQueued: jobCounts.find((j) => j.state === "queued")?.n ?? 0,
    jobsFailed: jobCounts.find((j) => j.state === "failed")?.n ?? 0,
  };
}

async function getRecentActivity() {
  return getDb()
    .select()
    .from(auditLog)
    .orderBy(desc(auditLog.at))
    .limit(10);
}

export default async function DashboardPage() {
  const [stats, activity] = await Promise.all([getStats(), getRecentActivity()]);

  return (
    <>
      <div className="crumb">overview</div>
      <h1 className="mb-3">dashboard</h1>

      <div className="stat-grid">
        <Stat title="servers" value={stats.serversTotal} sub={`${stats.serversReady} ready`} />
        <Stat title="sites" value={stats.sitesTotal} sub={`${stats.sitesLive} live`} />
        <Stat title="jobs running" value={stats.jobsRunning} sub={`${stats.jobsQueued} queued`} />
        <Stat title="jobs failed" value={stats.jobsFailed} tone={stats.jobsFailed > 0 ? "bad" : "muted"} />
      </div>

      <div className="panel">
        <div className="panel-title">recent activity</div>
        {activity.length === 0 ? (
          <div className="dim">no audit events yet</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: "12rem" }}>when</th>
                <th>actor</th>
                <th>action</th>
                <th>target</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((row) => (
                <tr key={row.id}>
                  <td className="muted">{row.at.toISOString().replace("T", " ").slice(0, 19)}</td>
                  <td>{row.actorUserId ?? <span className="dim">{row.actorKind}</span>}</td>
                  <td>{row.action}</td>
                  <td className="muted">
                    {row.targetKind ? `${row.targetKind}/${row.targetId ?? "?"}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Stat({
  title,
  value,
  sub,
  tone,
}: {
  title: string;
  value: number | string;
  sub?: string;
  tone?: "good" | "bad" | "muted";
}) {
  return (
    <div className="panel">
      <div className="panel-title">{title}</div>
      <div className="panel-value" style={tone === "bad" ? { color: "var(--bad)" } : undefined}>
        {value}
      </div>
      {sub ? <div className="dim mono mt-1" style={{ fontSize: "0.8rem" }}>{sub}</div> : null}
    </div>
  );
}
