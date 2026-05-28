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

  // Defer immediately. Discord requires a first response within 3s, and
  // auth + cold pg pool init can blow that budget. After deferring we have
  // a 15-min webhook window for editReply/followUp.
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  } catch (err) {
    log.error("deferReply failed", { err: String(err) });
    return;
  }

  const cmd = commands.find((c) => c.data.name === interaction.commandName);
  if (!cmd) {
    await interaction.editReply(`unknown command: ${interaction.commandName}`);
    return;
  }

  const auth = await requireRoleFromDiscord(interaction.user.id, cmd.minRole);
  if (!auth.ok) {
    await interaction.editReply(`access denied — ${auth.reason}`);
    return;
  }

  try {
    await cmd.run({ interaction, user: auth.user });
  } catch (err) {
    log.error("command failed", { err: String(err), cmd: interaction.commandName });
    const message = `error: ${err instanceof Error ? err.message : String(err)}`;
    try {
      await interaction.editReply(message);
    } catch {
      // Webhook token may already be dead (>15min). Nothing we can do.
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
