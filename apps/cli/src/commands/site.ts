import * as p from "@clack/prompts";
import kleur from "kleur";
import {
  SiteService,
  ServerService,
  TemplateService,
  registerAllHandlers,
  TemplateManifest,
} from "@tent/core";
import { tailJob } from "../ui/tail.js";

function slugify(domain: string): string {
  return domain.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

export async function cmdSiteNew(domain: string, options: { wait?: boolean } = { wait: true }): Promise<void> {
  registerAllHandlers();
  p.intro(kleur.bold().red(`tent new-site ${domain}`));

  // Validate domain.
  if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) {
    p.cancel("not a valid public domain");
    return;
  }
  if (await SiteService.getByDomain(domain)) {
    p.cancel(`a site already exists for ${domain}`);
    return;
  }

  // Pick server.
  const servers = (await ServerService.list()).filter((s) => s.status === "ready");
  if (servers.length === 0) {
    p.cancel("no ready servers. run `tent server add` first.");
    return;
  }
  const serverChoice = await p.select({
    message: "which server?",
    options: servers.map((s) => ({
      value: s.id,
      label: `${s.name} (${s.provider}, ${s.ipv4 ?? "?"})`,
    })),
  });
  if (p.isCancel(serverChoice)) {
    p.cancel("cancelled");
    return;
  }

  // Pick template.
  const templates = await TemplateService.list();
  if (templates.length === 0) {
    p.cancel("no templates registered. run `tent init` to sync built-ins.");
    return;
  }
  const templateChoice = await p.select({
    message: "which template?",
    options: templates.map((t) => ({ value: t.id, label: `${t.name} ${kleur.dim(t.version)} — ${t.description}` })),
  });
  if (p.isCancel(templateChoice)) {
    p.cancel("cancelled");
    return;
  }
  const tmpl = templates.find((t) => t.id === (templateChoice as string))!;
  const manifest = TemplateManifest.parse(tmpl.manifest);

  // Prompt for each variable.
  const variables: Record<string, unknown> = {};
  const secretVariables: Record<string, string> = {};
  for (const [key, def] of Object.entries(manifest.variables)) {
    if (def.type === "boolean") {
      const v = await p.confirm({
        message: `${key}${def.description ? " — " + def.description : ""}`,
        initialValue: def.default === true,
      });
      if (p.isCancel(v)) {
        p.cancel("cancelled");
        return;
      }
      if (def.secret) secretVariables[key] = String(v);
      else variables[key] = v;
      continue;
    }
    if (def.type === "enum" && def.values) {
      const v = await p.select({
        message: `${key}${def.description ? " — " + def.description : ""}`,
        options: def.values.map((val) => ({ value: val, label: val })),
      });
      if (p.isCancel(v)) {
        p.cancel("cancelled");
        return;
      }
      if (def.secret) secretVariables[key] = String(v);
      else variables[key] = v;
      continue;
    }
    const v = await p.text({
      message: `${key}${def.description ? " — " + def.description : ""}`,
      placeholder: def.default !== undefined ? String(def.default) : "",
      ...(def.default !== undefined ? { defaultValue: String(def.default) } : {}),
    });
    if (p.isCancel(v)) {
      p.cancel("cancelled");
      return;
    }
    if (def.secret) secretVariables[key] = String(v);
    else if (def.type === "number") variables[key] = Number(v);
    else variables[key] = String(v);
  }

  const slug = slugify(domain);
  const confirm = await p.confirm({
    message: `deploy ${kleur.bold(domain)} (slug: ${slug}) using ${manifest.name}@${manifest.version}?`,
  });
  if (p.isCancel(confirm) || !confirm) {
    p.cancel("cancelled");
    return;
  }

  const result = await SiteService.create({
    slug,
    domain,
    serverId: serverChoice as string,
    templateId: tmpl.id,
    variables,
    secretVariables,
  });

  if (options.wait === false) {
    p.outro(`enqueued. follow progress with \`tent job tail ${result.jobId}\``);
    return;
  }

  p.log.step(`deploying (job ${result.jobId})`);
  const job = await tailJob(result.jobId);
  if (job.state === "succeeded") {
    p.outro(kleur.green(`site live at https://${domain}`));
  } else {
    p.outro(kleur.red("deploy failed; see logs above"));
  }
}

export async function cmdSiteList(): Promise<void> {
  const rows = await SiteService.list();
  if (rows.length === 0) {
    console.log(kleur.dim("no sites yet. try `tent new-site <domain>`."));
    return;
  }
  for (const s of rows) {
    const status =
      s.status === "live" ? kleur.green(s.status)
        : s.status === "destroyed" ? kleur.dim(s.status)
          : kleur.yellow(s.status);
    console.log(`${kleur.bold(s.domain)}  ${kleur.dim(s.id)}  ${status}  port=${s.livePort ?? "?"}`);
  }
}

export async function cmdSiteDestroy(slug: string): Promise<void> {
  registerAllHandlers();
  const site = (await SiteService.getBySlug(slug)) ?? (await SiteService.getByDomain(slug)) ?? (await SiteService.get(slug));
  if (!site) {
    console.error(kleur.red(`no site matching "${slug}"`));
    process.exit(1);
  }
  const confirm = await p.confirm({
    message: `destroy site ${kleur.bold(site.domain)}? DNS, tunnel route, and container will be removed.`,
  });
  if (p.isCancel(confirm) || !confirm) {
    console.log("cancelled");
    return;
  }
  const { jobId } = await SiteService.destroy(site.id);
  await tailJob(jobId);
}
