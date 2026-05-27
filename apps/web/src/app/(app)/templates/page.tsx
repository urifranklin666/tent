import { TemplateService, TemplateManifest } from "@tent/core";
import { shortDate } from "@/lib/format";

export default async function TemplatesPage() {
  const rows = await TemplateService.list();

  return (
    <>
      <div className="crumb">stacks</div>
      <h1 className="mb-3">templates</h1>

      <p className="dim mb-3">
        Templates are loaded from <code>packages/templates/</code> on the control plane.
        Re-sync them with <code>tent template sync</code> after editing.
      </p>

      {rows.length === 0 ? (
        <div className="panel dim">no templates registered</div>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {rows.map((t) => {
            const m = (() => {
              try { return TemplateManifest.parse(t.manifest); }
              catch { return null; }
            })();
            return (
              <div key={t.id} className="panel">
                <div className="row between mb-2">
                  <div className="mono"><strong>{t.name}</strong> <span className="muted">{t.version}</span></div>
                  <div className="dim mono" style={{ fontSize: "0.8rem" }}>registered {shortDate(t.registeredAt)}</div>
                </div>
                <div className="mb-2">{t.description}</div>
                {m && Object.keys(m.variables).length > 0 ? (
                  <div className="mt-2">
                    <div className="panel-title mb-1">variables</div>
                    <table className="table">
                      <thead>
                        <tr><th>name</th><th>type</th><th>default</th><th>flags</th></tr>
                      </thead>
                      <tbody>
                        {Object.entries(m.variables).map(([k, v]) => (
                          <tr key={k}>
                            <td className="mono">{k}</td>
                            <td className="muted">{v.type}</td>
                            <td className="mono muted">{v.default === undefined ? "—" : String(v.default)}</td>
                            <td className="dim">
                              {[v.secret ? "secret" : null, v.optional ? "optional" : "required"]
                                .filter(Boolean)
                                .join(" · ")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
