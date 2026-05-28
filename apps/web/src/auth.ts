import NextAuth, { type DefaultSession, type Session } from "next-auth";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  getDb,
  users,
  accounts,
  sessions,
  verificationTokens,
  getDiscordAdminUserIds,
  type UserRole,
} from "@tent/core";
import { authConfig } from "./auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      banned: boolean;
    } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  // Lazy: evaluated per-request, so module import (e.g. during next build's
  // page-data collection) doesn't require TENT_DATABASE_URL/MASTER_KEY to be set.
  const db = getDb();
  const baseAdapter = DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  });

  // Override createUser: our schema has NOT NULL `handle` and custom
  // discordId/role fields that the default adapter doesn't populate.
  // The signIn callback has already gated against the allowlist, so
  // any user reaching createUser is an admin by design.
  // If the bot already inserted a row for this Discord id, return that
  // instead — otherwise we'd hit a UNIQUE violation on discord_id.
  const adapter: Adapter = {
    ...baseAdapter,
    async createUser(data) {
      const discordId = data.id ?? null; // Discord profile.id passes through as data.id
      if (discordId) {
        const existing = await db
          .select()
          .from(users)
          .where(eq(users.discordId, discordId))
          .limit(1);
        if (existing[0]) {
          // Backfill any web-only fields that the bot didn't have access to.
          const patch: Partial<typeof users.$inferInsert> = {};
          if (data.name && !existing[0].name) patch.name = data.name;
          if (data.email && !existing[0].email) patch.email = data.email;
          if (data.image && !existing[0].image) patch.image = data.image;
          if (data.emailVerified && !existing[0].emailVerified) {
            patch.emailVerified = data.emailVerified;
          }
          if (Object.keys(patch).length > 0) {
            await db.update(users).set(patch).where(eq(users.id, existing[0].id));
          }
          return existing[0] as unknown as AdapterUser;
        }
      }

      const id = data.id ?? randomUUID();
      const handle = data.name ?? data.email?.split("@")[0] ?? discordId ?? id;
      const inserted = await db
        .insert(users)
        .values({
          id,
          name: data.name ?? null,
          email: data.email ?? null,
          emailVerified: data.emailVerified ?? null,
          image: data.image ?? null,
          handle,
          discordId,
          role: "admin",
          lastSeenAt: new Date(),
        })
        .returning();
      const row = inserted[0];
      if (!row) throw new Error("createUser: insert returned no rows");
      return row as unknown as AdapterUser;
    },
  };

  return {
    ...authConfig,
    adapter,
    session: { strategy: "database" },
    callbacks: {
      async signIn({ user, account }) {
        if (account?.provider !== "discord") return false;
        const discordId = account.providerAccountId;
        const allowed = getDiscordAdminUserIds();
        if (allowed.length === 0) return false;
        if (!allowed.includes(discordId)) return false;
        // For returning users only, refresh lastSeenAt. role is set once at
        // createUser and is not touched here — admins can demote without
        // worrying about re-escalation on next login.
        if (user.id) {
          await db
            .update(users)
            .set({ lastSeenAt: new Date() })
            .where(eq(users.id, user.id));
        }
        return true;
      },
      async session({ session, user }) {
        const rows = await db
          .select({ role: users.role, banned: users.banned })
          .from(users)
          .where(eq(users.id, user.id))
          .limit(1);
        const row = rows[0];
        if (!row || row.banned) {
          session.user.role = "viewer";
          session.user.banned = true;
        } else {
          session.user.role = row.role;
          session.user.banned = false;
        }
        session.user.id = user.id;
        return session;
      },
    },
  };
});

export type SessionUser = Session["user"];

export async function requireSession(): Promise<Session> {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  return session;
}

export async function requireRole(min: UserRole) {
  const session = await requireSession();
  const rank: Record<UserRole, number> = { viewer: 0, operator: 1, admin: 2 };
  if (rank[session.user.role] < rank[min]) throw new Error("FORBIDDEN");
  return session;
}
