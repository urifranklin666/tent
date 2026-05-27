import { redirect } from "next/navigation";
import {
  ServerService,
  TemplateService,
  SiteService,
  registerAllHandlers,
  TemplateManifest,
} from "@tent/core";
import { requireRole } from "@/auth";
import { NewSiteForm } from "@/components/new-site-form";

export default async function NewSitePage() {
  await requireRole("operator");

  const [servers, templates] = await Promise.all([
    ServerService.list(),
    TemplateService.list(),
  ]);
  const readyServers = servers.filter((s) => s.status === "ready");

  const templatesWithManifest = templates.map((t) => {
    const m = TemplateManifest.parse(t.manifest);
    return {
      id: t.id,
      name: t.name,
      version: t.version,
      description: t.description,
      variables: m.variables,
    };
  });

  async function createSite(formData: FormData) {
    "use server";
    await requireRole("operator");
    registerAllHandlers();

    const domain = String(formData.get("domain") ?? "").trim().toLowerCase();
    const serverId = String(formData.get("serverId") ?? "");
    const templateId = String(formData.get("templateId") ?? "");
    if (!domain || !serverId || !templateId) throw new Error("missing required fields");

    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) throw new Error(`template ${templateId} not found`);
    const manifest = TemplateManifest.parse(tmpl.manifest);

    const variables: Record<string, unknown> = {};
    const secretVariables: Record<string, string> = {};
    for (const [key, def] of Object.entries(manifest.variables)) {
      const raw = formData.get(`var_${key}`);
      if (raw === null) continue;
      const stringVal = String(raw);
      if (def.secret) {
        if (stringVal) secretVariables[key] = stringVal;
        continue;
      }
      if (def.type === "boolean") variables[key] = formData.get(`var_${key}`) === "true";
      else if (def.type === "number") variables[key] = Number(stringVal);
      else variables[key] = stringVal;
    }

    const slug = domain.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
    const result = await SiteService.create({
      slug,
      domain,
      serverId,
      templateId,
      variables,
      secretVariables,
    });
    redirect(`/jobs/${result.jobId}`);
  }

  return (
    <>
      <div className="crumb">sites / new</div>
      <h1 className="mb-3">deploy a new site</h1>

      {readyServers.length === 0 ? (
        <div className="panel dim">
          no ready servers. add one first.
        </div>
      ) : templatesWithManifest.length === 0 ? (
        <div className="panel dim">
          no templates registered. run `tent template sync` on the host.
        </div>
      ) : (
        <NewSiteForm
          servers={readyServers.map((s) => ({ id: s.id, name: s.name, provider: s.provider, ipv4: s.ipv4 ?? "" }))}
          templates={templatesWithManifest}
          action={createSite}
        />
      )}
    </>
  );
}
