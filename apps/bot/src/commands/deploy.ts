import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { SiteService, registerAllHandlers } from "@tent/core";
import type { TentCommand } from "./types.js";
import { tailJobIntoInteraction } from "../ui/tail.js";

export const deployCommand: TentCommand = {
  minRole: "operator",
  data: new SlashCommandBuilder()
    .setName("tent-deploy")
    .setDescription("re-deploy an existing site")
    .addStringOption((o) =>
      o
        .setName("site")
        .setDescription("site slug, domain, or id")
        .setRequired(true),
    ),

  async run({ interaction, user }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    registerAllHandlers();

    const input = interaction.options.getString("site", true);
    const site =
      (await SiteService.getBySlug(input)) ??
      (await SiteService.getByDomain(input)) ??
      (await SiteService.get(input));
    if (!site) {
      await interaction.editReply(`no site matching \`${input}\``);
      return;
    }
    if (site.status === "destroyed" || site.status === "destroying") {
      await interaction.editReply(`site \`${site.domain}\` is \`${site.status}\`; cannot redeploy`);
      return;
    }

    const { jobId } = await SiteService.redeploy(site.id, { createdBy: user.id });
    await tailJobIntoInteraction(interaction, jobId, { title: `redeploying ${site.domain}` });
  },
};
