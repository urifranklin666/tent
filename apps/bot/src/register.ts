import { REST, Routes } from "discord.js";
import { commands } from "./commands/index.js";

const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token) {
  console.error("DISCORD_BOT_TOKEN is not set");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);
const body = commands.map((c) => c.data.toJSON());

async function main() {
  try {
    const me = (await rest.get(Routes.user())) as { id: string };
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(me.id, guildId), { body });
      console.log(`registered ${body.length} guild command(s) to ${guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(me.id), { body });
      console.log(`registered ${body.length} global command(s) (propagation up to 1h)`);
    }
  } catch (err) {
    console.error("registration failed:", err);
    process.exit(1);
  }
}

main();
