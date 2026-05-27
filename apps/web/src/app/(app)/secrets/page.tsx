import { revalidatePath } from "next/cache";
import { desc } from "drizzle-orm";
import { getDb, secrets, SecretService } from "@tent/core";
import { requireRole } from "@/auth";
import { shortDate } from "@/lib/format";

export default async function SecretsPage() {
  const session = await requireRole("admin");
  const rows = await getDb()
    .select({
      id: secrets.id,
      scope: secrets.scope,
      scopeRef: secrets.scopeRef,
      key: secrets.key,
      createdAt: secrets.createdAt,
      rotatedAt: secrets.rotatedAt,
    })
    .from(secrets)
    .orderBy(desc(secrets.createdAt));

  async function createSecret(formData: FormData) {
    "use server";
    await requireRole("admin");
    const key = String(formData.get("key") ?? "").trim();
    const value = String(formData.get("value") ?? "");
    if (!key || !value) throw new Error("key and value required");
    await SecretService.set({ scope: "global", key }, value);
    revalidatePath("/secrets");
  }

  async function deleteSecret(formData: FormData) {
    "use server";
    await requireRole("admin");
    const scope = String(formData.get("scope") ?? "global") as "global" | "server" | "site";
    const scopeRef = formData.get("scopeRef") ? String(formData.get("scopeRef")) : null;
    const key = String(formData.get("key") ?? "");
    if (!key) return;
    await SecretService.delete({ scope, scopeRef, key });
    revalidatePath("/secrets");
  }

  return (
    <>
      <div className="crumb">vault · admin only</div>
      <h1 className="mb-3">secrets</h1>

      <p className="dim mb-3">
        Values are encrypted at rest with libsodium and never displayed in the UI.
        You can only set or delete keys.
      </p>

      <div className="panel mb-3">
        <div className="panel-title">add global secret</div>
        <form action={createSecret} className="row gap-2" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1, marginBottom: 0 }}>
            <label htmlFor="key">key</label>
            <input id="key" name="key" required pattern="[A-Z][A-Z0-9_]*" placeholder="MY_API_TOKEN" />
          </div>
          <div className="field" style={{ flex: 2, marginBottom: 0 }}>
            <label htmlFor="value">value</label>
            <input id="value" name="value" type="password" required autoComplete="new-password" />
          </div>
          <button type="submit" className="primary">save</button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="panel dim">no secrets stored</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>scope</th>
              <th>key</th>
              <th>created</th>
              <th>rotated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td className="muted">
                  {s.scope}{s.scopeRef ? `/${s.scopeRef}` : ""}
                </td>
                <td className="mono">{s.key}</td>
                <td className="muted">{shortDate(s.createdAt)}</td>
                <td className="muted">{shortDate(s.rotatedAt)}</td>
                <td>
                  <form action={deleteSecret}>
                    <input type="hidden" name="scope" value={s.scope} />
                    {s.scopeRef ? <input type="hidden" name="scopeRef" value={s.scopeRef} /> : null}
                    <input type="hidden" name="key" value={s.key} />
                    <button type="submit" className="danger" style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}>
                      delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
