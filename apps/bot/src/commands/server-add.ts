import { SlashCommandBuilder, MessageFlags } from "discord.js";
import { eq } from "drizzle-orm";
import {
  ServerService,
  registerAllHandlers,
  getEnv,
  getDb,
  sshKeys,
  ServerProvider,
} from "@tent/core";
import type { TentCommand } from "./types.js";
import { tailJobIntoInteraction } from "../ui/tail.js";

export const serverAddCommand: TentCommand = {
  minRole: "operator",
  data: new SlashCommandBuilder()
    .setName("tent-server-add")
    .setDescription("provision (cloud) or attach (selfhosted) a server")
    .addStringOption((o) =>
      o
        .setName("provider")
        .setDescription("which provider to use")
        .setRequired(true)
        .addChoices(
          { name: "selfhosted (BYO ssh)", value: "selfhosted" },
          { name: "hetzner", value: "hetzner" },
          { name: "digitalocean", value: "digitalocean" },
          { name: "vultr", value: "vultr" },
        ),
    )
    .addStringOption((o) =>
      o
        .setName("name")
        .setDescription("server name (hostname; lowercase alphanumeric + hyphens)")
        .setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("host")
        .setDescription("ipv4 (selfhosted only)")
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName("region")
        .setDescription("provider region id (cloud only)")
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName("size")
        .setDescription("provider size id (cloud only)")
        .setRequired(false),
    )
    .addStringOption((o) =>
      o
        .setName("ssh_user")
        .setDescription("ssh user for selfhosted (default: root)")
        .setRequired(false),
    ),

  async run({ interaction, user }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    registerAllHandlers();

    const provider = interaction.options.getString("provider", true) as
      | "selfhosted"
      | "hetzner"
      | "digitalocean"
      | "vultr";
    const name = interaction.options.getString("name", true);
    const host = interaction.options.getString("host") ?? undefined;
    const region = interaction.options.getString("region") ?? undefined;
    const size = interaction.options.getString("size") ?? undefined;
    const sshUser = interaction.options.getString("ssh_user") ?? "root";

    ServerProvider.parse(provider); // defense in depth
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(name)) {
      await interaction.editReply("invalid name: alphanumeric + hyphens, no leading/trailing hyphen");
      return;
    }

    const env = getEnv();
    if (provider === "selfhosted") {
      if (!host || !/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
        await interaction.editReply("selfhosted requires `host` as an ipv4 address");
        return;
      }
    } else {
      const tokenSet =
        (provider === "hetzner" && !!env.HETZNER_API_TOKEN) ||
        (provider === "digitalocean" && !!env.DIGITALOCEAN_API_TOKEN) ||
        (provider === "vultr" && !!env.VULTR_API_KEY);
      if (!tokenSet) {
        await interaction.editReply(`${provider} api token is not configured on the control plane`);
        return;
      }
      if (!region || !size) {
        await interaction.editReply(`${provider} requires \`region\` and \`size\``);
        return;
      }
    }

    const result = await ServerService.add({
      name,
      provider,
      regionId: region,
      sizeId: size,
      host,
      sshUser,
      sshPort: 22,
      tags: [],
      createdBy: user.id,
    });

    // For selfhosted: surface the public key so the operator can paste it
    // into authorized_keys on the box before bootstrap runs.
    if (provider === "selfhosted") {
      const server = await ServerService.get(result.serverId);
      if (server?.sshKeyId) {
        const keyRow = await getDb()
          .select({ publicKey: sshKeys.publicKey })
          .from(sshKeys)
          .where(eq(sshKeys.id, server.sshKeyId))
          .limit(1);
        const pub = keyRow[0]?.publicKey;
        if (pub) {
          await interaction.followUp({
            content:
              `add this key to \`~/.ssh/authorized_keys\` on \`${host}\` as \`${sshUser}\` ` +
              `**before** continuing, then watch the bootstrap job below:\n` +
              "```\n" + pub + "\n```",
            flags: MessageFlags.Ephemeral,
          });
        }
      }
    }

    // Tail provisioning first (cloud only), then bootstrap.
    if (result.provisionJobId) {
      const provisionState = await tailJobIntoInteraction(
        interaction,
        result.provisionJobId,
        { title: `provisioning ${name}` },
      );
      if (provisionState !== "succeeded") {
        await interaction.followUp({
          content: "provisioning failed; bootstrap will not run",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }
    await tailJobIntoInteraction(
      interaction,
      result.bootstrapJobId,
      { title: `bootstrapping ${name}` },
    );
  },
};
