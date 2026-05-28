import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from "discord.js";
import type { UserRole, User } from "@tent/core";

export type CommandData =
  | SlashCommandBuilder
  | SlashCommandOptionsOnlyBuilder
  | SlashCommandSubcommandsOnlyBuilder;

export interface CommandContext {
  interaction: ChatInputCommandInteraction;
  user: User;
}

export interface TentCommand {
  data: CommandData;
  minRole: UserRole;
  run: (ctx: CommandContext) => Promise<void>;
}
