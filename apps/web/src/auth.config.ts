import type { NextAuthConfig } from "next-auth";
import Discord from "next-auth/providers/discord";

// Edge-safe auth config: no DB adapter, no node-only deps.
// Used by middleware to know whether a request is authenticated.
// The full config (with adapter) lives in auth.ts and is used by
// server actions / route handlers / pages.
export const authConfig = {
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
      authorization: { params: { scope: "identify email" } },
    }),
  ],
  pages: { signIn: "/login", error: "/login" },
} satisfies NextAuthConfig;
