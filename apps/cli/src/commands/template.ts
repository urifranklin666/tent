import kleur from "kleur";
import { TemplateService, syncTemplates } from "@tent/core";

export async function cmdTemplateList(): Promise<void> {
  const rows = await TemplateService.list();
  if (rows.length === 0) {
    console.log(kleur.dim("no templates registered. run `tent template sync`."));
    return;
  }
  for (const t of rows) {
    console.log(`${kleur.bold(t.name)} ${kleur.dim(t.version)}  ${t.description}`);
  }
}

export async function cmdTemplateSync(): Promise<void> {
  const count = await syncTemplates();
  console.log(kleur.green(`synced ${count} template(s)`));
}
