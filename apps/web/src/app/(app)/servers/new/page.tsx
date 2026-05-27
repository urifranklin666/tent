import { redirect } from "next/navigation";
import { z } from "zod";
import {
  ServerService,
  listProviders,
  getEnv,
  registerAllHandlers,
  ServerProvider,
  type ServerProvider as ServerProviderType,
} from "@tent/core";
import { requireRole } from "@/auth";
import { NewServerForm } from "@/components/new-server-form";

export default async function NewServerPage() {
  await requireRole("operator");

  const env = getEnv();
  const available = listProviders().filter((id) => {
    if (id === "selfhosted") return true;
    if (id === "hetzner") return !!env.HETZNER_API_TOKEN;
    if (id === "digitalocean") return !!env.DIGITALOCEAN_API_TOKEN;
    if (id === "vultr") return !!env.VULTR_API_KEY;
    return false;
  });

  async function createServer(formData: FormData) {
    "use server";
    await requireRole("operator");
    registerAllHandlers();

    const Schema = z.object({
      name: z.string().min(1),
      provider: ServerProvider,
      regionId: z.string().optional(),
      sizeId: z.string().optional(),
      host: z.string().optional(),
      sshUser: z.string().default("root"),
    });
    const parsed = Schema.parse({
      name: formData.get("name"),
      provider: formData.get("provider"),
      regionId: formData.get("regionId") || undefined,
      sizeId: formData.get("sizeId") || undefined,
      host: formData.get("host") || undefined,
      sshUser: formData.get("sshUser") || "root",
    });

    const result = await ServerService.add({
      name: parsed.name,
      provider: parsed.provider,
      regionId: parsed.regionId,
      sizeId: parsed.sizeId,
      host: parsed.host,
      sshUser: parsed.sshUser,
      sshPort: 22,
      tags: [],
    });

    const tailJob = result.provisionJobId ?? result.bootstrapJobId;
    redirect(`/jobs/${tailJob}`);
  }

  return (
    <>
      <div className="crumb">servers / new</div>
      <h1 className="mb-3">add a server</h1>
      <NewServerForm
        availableProviders={available as ServerProviderType[]}
        action={createServer}
      />
    </>
  );
}
