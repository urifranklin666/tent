import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { logger } from "@tent/core";
import { requireRoleFromDiscord } from "./auth.js";
import { commands } from "./commands/index.js";

const log = logger.child({ component: "bot" });

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  console.error("DISCORD_BOT_TOKEN is not set");
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  log.info("bot logged in", { user: c.user.tag });
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = commands.find((c) => c.data.name === interaction.commandName);
  if (!cmd) {
    await interaction.reply({
      content: `unknown command: ${interaction.commandName}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const auth = await requireRoleFromDiscord(interaction.user.id, cmd.minRole);
  if (!auth.ok) {
    await interaction.reply({
      content: `access denied — ${auth.reason}`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await cmd.run({ interaction, user: auth.user });
  } catch (err) {
    log.error("command failed", { err: String(err), cmd: interaction.commandName });
    const message = `error: ${err instanceof Error ? err.message : String(err)}`;
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
    }
  }
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutting down", { signal });
  await client.destroy();
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

client.login(token).catch((err) => {
  log.error("login failed", { err: String(err) });
  process.exit(1);
});
