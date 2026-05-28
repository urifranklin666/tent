import { SlashCommandBuilder } from "discord.js";
import { ServerService, SiteService } from "@tent/core";
import type { TentCommand } from "./types.js";

export const listCommand: TentCommand = {
  minRole: "viewer",
  data: new SlashCommandBuilder()
    .setName("tent-list")
    .setDescription("list servers or sites")
    .addSubcommand((s) =>
      s.setName("servers").setDescription("list managed servers"),
    )
    .addSubcommand((s) =>
      s.setName("sites").setDescription("list deployed sites"),
    ),

  async run({ interaction }) {
    const sub = interaction.options.getSubcommand();

    if (sub === "servers") {
      const rows = await ServerService.list();
      if (rows.length === 0) {
        await interaction.editReply("no servers yet. try `/tent-server-add`.");
        return;
      }
      const lines = rows.map(
        (s) =>
          `${pad(s.name, 16)} ${pad(s.provider, 14)} ${pad(s.ipv4 ?? "-", 16)} ${s.status}`,
      );
      const header = `${pad("name", 16)} ${pad("provider", 14)} ${pad("ipv4", 16)} status`;
      await interaction.editReply(codeBlock([header, ...lines].join("\n")));
      return;
    }

    if (sub === "sites") {
      const rows = await SiteService.list();
      if (rows.length === 0) {
        await interaction.editReply("no sites yet. try `/tent-new-site`.");
        return;
      }
      const lines = rows.map(
        (s) => `${pad(s.domain, 36)} ${pad(s.slug, 24)} ${s.status}`,
      );
      const header = `${pad("domain", 36)} ${pad("slug", 24)} status`;
      await interaction.editReply(codeBlock([header, ...lines].join("\n")));
      return;
    }
  },
};

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}

function codeBlock(body: string): string {
  // Discord message limit is 2000 chars; leave headroom for fences.
  const max = 1900;
  const trimmed = body.length > max ? body.slice(0, max) + "\n…" : body;
  return "```\n" + trimmed + "\n```";
}
