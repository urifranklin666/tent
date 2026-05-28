import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { ServerService, getDb, sites, sshKeys } from "@tent/core";
import { requireRole } from "@/auth";
import { serverStatusTone, siteStatusTone, shortDate } from "@/lib/format";

export default async function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const server = await ServerService.get(id);
  if (!server) notFound();

  const db = getDb();
  const [hostedSites, pubKeyRow] = await Promise.all([
    db.select().from(sites).where(eq(sites.serverId, server.id)),
    server.sshKeyId
      ? db
          .select({ publicKey: sshKeys.publicKey })
          .from(sshKeys)
          .where(eq(sshKeys.id, server.sshKeyId))
          .limit(1)
      : Promise.resolve([] as { publicKey: string }[]),
  ]);
  const publicKey = pubKeyRow[0]?.publicKey;

  async function destroyServer(formData: FormData) {
    "use server";
    await requireRole("admin");
    const confirmName = String(formData.get("confirmName") ?? "");
    if (confirmName !== server!.name) {
      throw new Error(`Type the server name "${server!.name}" to confirm.`);
    }
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

      {server.provider === "selfhosted" && publicKey ? (
        <div className="panel mb-3">
          <div className="panel-title">ssh public key</div>
          <p className="dim mb-2" style={{ fontSize: "0.85rem" }}>
            Add this to <code>~/.ssh/authorized_keys</code> for the{" "}
            <span className="mono">{server.sshUser}</span> user on{" "}
            <span className="mono">{server.ipv4 ?? "(your host)"}</span> before bootstrap runs.
          </p>
          <pre className="tail" style={{ maxHeight: "none", margin: 0 }}>{publicKey}</pre>
        </div>
      ) : null}

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
        <div className="panel" style={{ borderColor: "var(--bad)" }}>
          <div className="panel-title" style={{ color: "var(--bad)" }}>danger zone</div>
          <p className="dim mb-2" style={{ fontSize: "0.85rem" }}>
            Destroying this server will tear down its cloudflare tunnel and (for
            cloud providers) delete the VM. Sites on this server will also be
            destroyed. To confirm, type the server name{" "}
            <span className="mono">{server.name}</span> below.
          </p>
          <form action={destroyServer} className="row gap-2" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label htmlFor="confirmName">type server name to confirm</label>
              <input id="confirmName" name="confirmName" autoComplete="off" required />
            </div>
            <button type="submit" className="danger">destroy server</button>
          </form>
        </div>
      ) : null}
    </>
  );
}
