import { SlashCommandBuilder, MessageFlags } from "discord.js";
import {
  ServerService,
  SiteService,
  TemplateService,
  TemplateManifest,
  registerAllHandlers,
} from "@tent/core";
import type { TentCommand } from "./types.js";
import { tailJobIntoInteraction } from "../ui/tail.js";

export const newSiteCommand: TentCommand = {
  minRole: "operator",
  data: new SlashCommandBuilder()
    .setName("tent-new-site")
    .setDescription("deploy a new site")
    .addStringOption((o) =>
      o.setName("domain").setDescription("public domain (e.g. hello.example.com)").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("server").setDescription("server name or id").setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("template").setDescription("template name (e.g. static)").setRequired(true),
    ),

  async run({ interaction, user }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    registerAllHandlers();

    const domain = interaction.options.getString("domain", true).trim().toLowerCase();
    const serverInput = interaction.options.getString("server", true);
    const templateName = interaction.options.getString("template", true);

    if (!/^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain)) {
      await interaction.editReply("invalid domain");
      return;
    }
    if (await SiteService.getByDomain(domain)) {
      await interaction.editReply(`a site already exists for ${domain}`);
      return;
    }

    const server =
      (await ServerService.getByName(serverInput)) ?? (await ServerService.get(serverInput));
    if (!server) {
      await interaction.editReply(`no server matching \`${serverInput}\``);
      return;
    }
    if (server.status !== "ready") {
      await interaction.editReply(`server \`${server.name}\` is \`${server.status}\`, not ready`);
      return;
    }

    const template = await TemplateService.getByName(templateName);
    if (!template) {
      await interaction.editReply(`no template named \`${templateName}\``);
      return;
    }
    const manifest = TemplateManifest.parse(template.manifest);

    // Use defaults for every variable. Required variables without a default
    // will surface during deploy; for non-engineer bot usage that's the right
    // tradeoff (a slash command is a poor surface for arbitrary key/value).
    const variables: Record<string, unknown> = {};
    const secretVariables: Record<string, string> = {};
    for (const [key, def] of Object.entries(manifest.variables)) {
      if (def.default !== undefined) {
        if (def.secret) secretVariables[key] = String(def.default);
        else variables[key] = def.default;
      }
    }

    const slug = domain.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
    const { jobId } = await SiteService.create({
      slug,
      domain,
      serverId: server.id,
      templateId: template.id,
      variables,
      secretVariables,
      createdBy: user.id,
    });

    await tailJobIntoInteraction(interaction, jobId, { title: `deploying ${domain}` });
  },
};
