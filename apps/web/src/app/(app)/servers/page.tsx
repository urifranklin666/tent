import Link from "next/link";
import { ServerService } from "@tent/core";
import { serverStatusTone, relativeTime } from "@/lib/format";

export default async function ServersPage() {
  const servers = await ServerService.list();

  return (
    <>
      <div className="crumb">inventory</div>
      <div className="row between mb-3">
        <h1>servers</h1>
        <Link href="/servers/new" className="btn primary">add server</Link>
      </div>

      {servers.length === 0 ? (
        <div className="panel dim">
          no servers yet. <Link href="/servers/new">add one</Link>.
        </div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>name</th>
              <th>provider</th>
              <th>ipv4</th>
              <th>status</th>
              <th>bootstrapped</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/servers/${s.id}`}>{s.name}</Link></td>
                <td className="muted">{s.provider}</td>
                <td className="muted">{s.ipv4 ?? "—"}</td>
                <td><span className={`badge ${serverStatusTone(s.status)}`}>{s.status}</span></td>
                <td className="muted">{relativeTime(s.bootstrappedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
