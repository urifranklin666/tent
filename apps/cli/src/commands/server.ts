import * as p from "@clack/prompts";
import kleur from "kleur";
import {
  ServerService,
  getProvider,
  listProviders,
  registerAllHandlers,
  getEnv,
  type ServerProvider,
} from "@tent/core";
import { tailJob } from "../ui/tail.js";

export async function cmdServerAdd(options: { wait?: boolean } = { wait: true }): Promise<void> {
  registerAllHandlers();
  p.intro(kleur.bold().red("tent server add"));

  const env = getEnv();
  const available = listProviders().filter((id) => {
    if (id === "selfhosted") return true;
    if (id === "hetzner") return !!env.HETZNER_API_TOKEN;
    if (id === "digitalocean") return !!env.DIGITALOCEAN_API_TOKEN;
    if (id === "vultr") return !!env.VULTR_API_KEY;
    return false;
  });

  const providerChoice = await p.select({
    message: "which provider?",
    options: available.map((id) => ({ value: id, label: id })),
  });
  if (p.isCancel(providerChoice)) {
    p.cancel("cancelled");
    return;
  }
  const provider = providerChoice as ServerProvider;

  const name = await p.text({
    message: "server name (used as the hostname and inventory id)",
    placeholder: "barn",
    validate: (v) => (v && /^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(v) ? undefined : "alphanumeric + hyphens; no leading/trailing hyphen"),
  });
  if (p.isCancel(name)) {
    p.cancel("cancelled");
    return;
  }

  let regionId: string | undefined;
  let sizeId: string | undefined;
  let host: string | undefined;
  let sshUser = "root";

  if (provider === "selfhosted") {
    const hostInput = await p.text({
      message: "ipv4 address of your box",
      validate: (v) => (v && /^\d{1,3}(\.\d{1,3}){3}$/.test(v) ? undefined : "expecting an IPv4 like 1.2.3.4"),
    });
    if (p.isCancel(hostInput)) return;
    host = hostInput as string;

    const userInput = await p.text({
      message: "ssh user",
      placeholder: "root",
      defaultValue: "root",
    });
    if (p.isCancel(userInput)) return;
    sshUser = (userInput as string) || "root";

    p.log.warn(
      "before continuing you must add the public key tent will generate to ~/.ssh/authorized_keys on the box. it will be printed after this server is registered.",
    );
  } else {
    const providerImpl = getProvider(provider);
    const spinner = p.spinner();
    spinner.start("loading regions");
    const regions = await providerImpl.listRegions();
    spinner.stop(`${regions.length} regions`);
    const r = await p.select({
      message: "which region?",
      options: regions.map((reg) => ({ value: reg.id, label: reg.label })),
    });
    if (p.isCancel(r)) return;
    regionId = r as string;

    spinner.start("loading sizes");
    const sizes = await providerImpl.listSizes(regionId);
    spinner.stop(`${sizes.length} sizes`);
    const s = await p.select({
      message: "which size?",
      options: sizes
        .slice(0, 30)
        .map((sz) => ({
          value: sz.id,
          label: `${sz.label} — ${sz.cpuCores}c / ${(sz.memoryMb / 1024).toFixed(0)}gb / ${sz.diskGb}gb · ~$${sz.monthlyPriceUsd.toFixed(2)}/mo`,
        })),
    });
    if (p.isCancel(s)) return;
    sizeId = s as string;
  }

  const confirm = await p.confirm({
    message: `register server "${name}" on ${provider}?`,
  });
  if (p.isCancel(confirm) || !confirm) {
    p.cancel("cancelled");
    return;
  }

  const spinner = p.spinner();
  spinner.start("registering server in inventory");
  const result = await ServerService.add({
    name: name as string,
    provider,
    regionId: regionId,
    sizeId: sizeId,
    host: host,
    sshUser,
    sshPort: 22,
    tags: [],
  });
  spinner.stop(`server registered: ${result.serverId}`);

  if (provider === "selfhosted") {
    // Show the public key so the operator can install it manually.
    const server = await ServerService.get(result.serverId);
    const { getDb } = await import("@tent/core");
    const { sshKeys } = await import("@tent/core").then((m) => m.schema);
    const { eq } = await import("drizzle-orm");
    const keyRows = await getDb().select().from(sshKeys).where(eq(sshKeys.id, server!.sshKeyId!)).limit(1);
    const pubKey = keyRows[0]?.publicKey ?? "(missing)";
    p.note(pubKey, "add this public key to root@" + host + ":~/.ssh/authorized_keys");
  }

  if (options.wait === false) {
    p.outro(
      `enqueued. follow progress with \`tent job tail ${result.bootstrapJobId}\``,
    );
    return;
  }

  if (result.provisionJobId) {
    p.log.step(`provisioning (job ${result.provisionJobId})`);
    const provision = await tailJob(result.provisionJobId);
    if (provision.state !== "succeeded") {
      p.outro(kleur.red("provisioning failed; bootstrap will not run"));
      return;
    }
  }
  p.log.step(`bootstrapping (job ${result.bootstrapJobId})`);
  const boot = await tailJob(result.bootstrapJobId);
  if (boot.state === "succeeded") {
    p.outro(kleur.green(`server "${name}" is ready.`));
  } else {
    p.outro(kleur.red("bootstrap failed; see logs above"));
  }
}

export async function cmdServerList(): Promise<void> {
  const rows = await ServerService.list();
  if (rows.length === 0) {
    console.log(kleur.dim("no servers yet. try `tent server add`."));
    return;
  }
  for (const s of rows) {
    const status =
      s.status === "ready" ? kleur.green(s.status)
        : s.status === "destroyed" ? kleur.dim(s.status)
          : kleur.yellow(s.status);
    console.log(`${kleur.bold(s.name)}  ${kleur.dim(s.id)}  ${s.provider}  ${s.ipv4 ?? "(no ip)"}  ${status}`);
  }
}

export async function cmdServerDestroy(id: string): Promise<void> {
  registerAllHandlers();
  const server = (await ServerService.getByName(id)) ?? (await ServerService.get(id));
  if (!server) {
    console.error(kleur.red(`no server matching "${id}"`));
    process.exit(1);
  }
  const confirm = await p.confirm({
    message: `destroy server ${kleur.bold(server.name)} (${server.provider}, ipv4=${server.ipv4 ?? "?"})? this is permanent.`,
  });
  if (p.isCancel(confirm) || !confirm) {
    console.log("cancelled");
    return;
  }
  const { jobId } = await ServerService.destroy(server.id);
  await tailJob(jobId);
}
