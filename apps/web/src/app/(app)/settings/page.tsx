import { getEnv, getDiscordAdminUserIds, CORE_VERSION } from "@tent/core";
import { requireSession } from "@/auth";

export default async function SettingsPage() {
  const session = await requireSession();
  const env = getEnv();
  const admins = getDiscordAdminUserIds();

  return (
    <>
      <div className="crumb">control plane</div>
      <h1 className="mb-3">settings</h1>

      <div className="panel mb-3">
        <div className="panel-title">you</div>
        <table className="table">
          <tbody>
            <tr><td className="muted" style={{ width: "12rem" }}>id</td><td className="mono">{session.user.id}</td></tr>
            <tr><td className="muted">name</td><td>{session.user.name ?? "—"}</td></tr>
            <tr><td className="muted">email</td><td>{session.user.email ?? "—"}</td></tr>
            <tr><td className="muted">role</td><td><span className="badge good">{session.user.role}</span></td></tr>
          </tbody>
        </table>
      </div>

      <div className="panel mb-3">
        <div className="panel-title">runtime</div>
        <table className="table">
          <tbody>
            <tr><td className="muted" style={{ width: "16rem" }}>core version</td><td className="mono">{CORE_VERSION}</td></tr>
            <tr><td className="muted">public host</td><td className="mono">{env.TENT_PUBLIC_HOST}</td></tr>
            <tr><td className="muted">state dir</td><td className="mono">{env.TENT_STATE_DIR}</td></tr>
            <tr><td className="muted">worker concurrency</td><td className="mono">{env.TENT_WORKER_CONCURRENCY}</td></tr>
            <tr><td className="muted">log level</td><td className="mono">{env.TENT_LOG_LEVEL}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="panel mb-3">
        <div className="panel-title">integrations</div>
        <table className="table">
          <tbody>
            <tr><td className="muted" style={{ width: "16rem" }}>cloudflare api token</td><td>{env.CLOUDFLARE_API_TOKEN ? <span className="badge good">set</span> : <span className="badge bad">missing</span>}</td></tr>
            <tr><td className="muted">hetzner</td><td>{env.HETZNER_API_TOKEN ? <span className="badge good">set</span> : <span className="badge muted">unset</span>}</td></tr>
            <tr><td className="muted">digitalocean</td><td>{env.DIGITALOCEAN_API_TOKEN ? <span className="badge good">set</span> : <span className="badge muted">unset</span>}</td></tr>
            <tr><td className="muted">vultr</td><td>{env.VULTR_API_KEY ? <span className="badge good">set</span> : <span className="badge muted">unset</span>}</td></tr>
            <tr><td className="muted">discord client</td><td>{env.DISCORD_CLIENT_ID ? <span className="badge good">set</span> : <span className="badge bad">missing</span>}</td></tr>
            <tr><td className="muted">discord bot</td><td>{env.DISCORD_BOT_TOKEN ? <span className="badge good">set</span> : <span className="badge muted">unset</span>}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="panel">
        <div className="panel-title">allowlisted discord ids</div>
        {admins.length === 0 ? (
          <div className="dim">
            DISCORD_ADMIN_USER_IDS is empty — nobody can sign in. Set it in /etc/tent/env.
          </div>
        ) : (
          <ul className="mono" style={{ paddingLeft: "1.25rem", margin: 0 }}>
            {admins.map((id) => <li key={id}>{id}</li>)}
          </ul>
        )}
      </div>
    </>
  );
}
