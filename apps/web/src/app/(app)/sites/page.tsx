import Link from "next/link";
import { SiteService, ServerService } from "@tent/core";
import { siteStatusTone, relativeTime } from "@/lib/format";

export default async function SitesPage() {
  const [sites, servers] = await Promise.all([SiteService.list(), ServerService.list()]);
  const serverById = new Map(servers.map((s) => [s.id, s]));

  return (
    <>
      <div className="crumb">deployments</div>
      <div className="row between mb-3">
        <h1>sites</h1>
        <Link href="/sites/new" className="btn primary">new site</Link>
      </div>

      {sites.length === 0 ? (
        <div className="panel dim">
          no sites yet. <Link href="/sites/new">deploy one</Link>.
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>domain</th>
              <th>server</th>
              <th>status</th>
              <th>port</th>
              <th>created</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/sites/${s.id}`}>{s.domain}</Link></td>
                <td className="muted">{serverById.get(s.serverId)?.name ?? "—"}</td>
                <td><span className={`badge ${siteStatusTone(s.status)}`}>{s.status}</span></td>
                <td className="muted">{s.livePort ?? "—"}</td>
                <td className="muted">{relativeTime(s.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
