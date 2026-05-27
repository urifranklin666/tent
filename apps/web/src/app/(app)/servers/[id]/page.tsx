import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ServerService, getDb, sites } from "@tent/core";
import { requireRole } from "@/auth";
import { serverStatusTone, siteStatusTone, shortDate } from "@/lib/format";

export default async function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const server = await ServerService.get(id);
  if (!server) notFound();

  const db = getDb();
  const hostedSites = await db.select().from(sites).where(eq(sites.serverId, server.id));

  async function destroyServer() {
    "use server";
    await requireRole("admin");
    const { jobId } = await ServerService.destroy(server!.id);
    redirect(`/jobs/${jobId}`);
  }

  return (
    <>
      <div className="crumb"><Link href="/servers">servers</Link> / {server.name}</div>
      <div className="row between mb-3">
        <h1>{server.name}</h1>
        <span className={`badge ${serverStatusTone(server.status)}`}>{server.status}</span>
      </div>

      <div className="panel mb-3">
        <table className="table">
          <tbody>
            <tr><td className="muted" style={{ width: "12rem" }}>id</td><td className="mono">{server.id}</td></tr>
            <tr><td className="muted">provider</td><td>{server.provider}</td></tr>
            <tr><td className="muted">ipv4</td><td className="mono">{server.ipv4 ?? "—"}</td></tr>
            <tr><td className="muted">region</td><td>{server.region ?? "—"}</td></tr>
            <tr><td className="muted">size</td><td>{server.size ?? "—"}</td></tr>
            <tr><td className="muted">ssh user</td><td className="mono">{server.sshUser}@{server.sshPort}</td></tr>
            <tr><td className="muted">host fingerprint</td><td className="mono" style={{ fontSize: "0.8rem" }}>{server.hostFingerprint ?? "—"}</td></tr>
            <tr><td className="muted">cloudflare tunnel</td><td className="mono">{server.cfTunnelId ?? "—"}</td></tr>
            <tr><td className="muted">created</td><td>{shortDate(server.createdAt)}</td></tr>
            <tr><td className="muted">bootstrapped</td><td>{shortDate(server.bootstrappedAt)}</td></tr>
          </tbody>
        </table>
      </div>

      <h2 className="mb-2">sites on this server</h2>
      {hostedSites.length === 0 ? (
        <div className="dim mb-3">none</div>
      ) : (
        <table className="table mb-3">
          <thead>
            <tr><th>domain</th><th>slug</th><th>status</th><th>port</th></tr>
          </thead>
          <tbody>
            {hostedSites.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/sites/${s.id}`}>{s.domain}</Link></td>
                <td className="muted">{s.slug}</td>
                <td><span className={`badge ${siteStatusTone(s.status)}`}>{s.status}</span></td>
                <td className="muted">{s.livePort ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {server.status !== "destroyed" && server.status !== "destroying" ? (
        <form action={destroyServer}>
          <button type="submit" className="danger">destroy server</button>
        </form>
      ) : null}
    </>
  );
}
