import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteService, ServerService } from "@tent/core";
import { requireRole } from "@/auth";
import { siteStatusTone, shortDate } from "@/lib/format";

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await SiteService.get(id);
  if (!site) notFound();
  const server = await ServerService.get(site.serverId);

  async function destroySite(formData: FormData) {
    "use server";
    await requireRole("admin");
    const confirmDomain = String(formData.get("confirmDomain") ?? "");
    if (confirmDomain !== site!.domain) {
      throw new Error(`Type the domain "${site!.domain}" to confirm.`);
    }
    const { jobId } = await SiteService.destroy(site!.id);
    redirect(`/jobs/${jobId}`);
  }

  return (
    <>
      <div className="crumb"><Link href="/sites">sites</Link> / {site.domain}</div>
      <div className="row between mb-3">
        <h1>{site.domain}</h1>
        <span className={`badge ${siteStatusTone(site.status)}`}>{site.status}</span>
      </div>

      <div className="panel mb-3">
        <table className="table">
          <tbody>
            <tr><td className="muted" style={{ width: "12rem" }}>id</td><td className="mono">{site.id}</td></tr>
            <tr><td className="muted">slug</td><td className="mono">{site.slug}</td></tr>
            <tr><td className="muted">server</td><td>{server ? <Link href={`/servers/${server.id}`}>{server.name}</Link> : "—"}</td></tr>
            <tr><td className="muted">template</td><td className="mono">{site.templateId}</td></tr>
            <tr><td className="muted">live port</td><td className="mono">{site.livePort ?? "—"}</td></tr>
            <tr><td className="muted">cf tunnel hostname</td><td className="mono">{site.cfTunnelHostname ?? "—"}</td></tr>
            <tr><td className="muted">cf dns records</td><td className="mono" style={{ fontSize: "0.8rem" }}>{site.cfDnsRecordIds.length > 0 ? site.cfDnsRecordIds.join(", ") : "—"}</td></tr>
            <tr><td className="muted">created</td><td>{shortDate(site.createdAt)}</td></tr>
            <tr><td className="muted">updated</td><td>{shortDate(site.updatedAt)}</td></tr>
          </tbody>
        </table>
      </div>

      {site.variablesPlain && Object.keys(site.variablesPlain as Record<string, unknown>).length > 0 ? (
        <div className="panel mb-3">
          <div className="panel-title">variables</div>
          <table className="table">
            <tbody>
              {Object.entries(site.variablesPlain as Record<string, unknown>).map(([k, v]) => (
                <tr key={k}>
                  <td className="muted mono" style={{ width: "14rem" }}>{k}</td>
                  <td className="mono">{String(v)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {site.status !== "destroyed" && site.status !== "destroying" ? (
        <div className="panel" style={{ borderColor: "var(--bad)" }}>
          <div className="panel-title" style={{ color: "var(--bad)" }}>danger zone</div>
          <p className="dim mb-2" style={{ fontSize: "0.85rem" }}>
            Destroying removes the cloudflare DNS record, tunnel ingress, and
            container. To confirm, type the domain{" "}
            <span className="mono">{site.domain}</span> below.
          </p>
          <form action={destroySite} className="row gap-2" style={{ alignItems: "flex-end" }}>
            <div className="field" style={{ flex: 1, marginBottom: 0 }}>
              <label htmlFor="confirmDomain">type domain to confirm</label>
              <input id="confirmDomain" name="confirmDomain" autoComplete="off" required />
            </div>
            <button type="submit" className="danger">destroy site</button>
          </form>
        </div>
      ) : null}
    </>
  );
}
