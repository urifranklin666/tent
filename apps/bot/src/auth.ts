import { eq } from "drizzle-orm";
import {
  getDb,
  users,
  getDiscordAdminUserIds,
  type UserRole,
  type User,
} from "@tent/core";

const ROLE_RANK: Record<UserRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

export interface AuthResult {
  ok: true;
  user: User;
}

export interface AuthDenied {
  ok: false;
  reason: string;
}

/**
 * Defense-in-depth role check, run on every interaction. Treats the users
 * table as the source of truth: a user must be both on DISCORD_ADMIN_USER_IDS
 * (seed allowlist) OR already have a row with role >= min in the db, and
 * must not be banned.
 *
 * If the user has no row yet but is on the seed allowlist, they're upserted
 * as admin so subsequent interactions stop hitting the slow path.
 */
export async function requireRoleFromDiscord(
  discordUserId: string,
  min: UserRole,
): Promise<AuthResult | AuthDenied> {
  const db = getDb();

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.discordId, discordUserId))
    .limit(1);

  let row: User | undefined = existing[0];

  if (!row) {
    const allowed = getDiscordAdminUserIds();
    if (!allowed.includes(discordUserId)) {
      return { ok: false, reason: "not on the operator allowlist" };
    }
    const inserted = await db
      .insert(users)
      .values({
        id: discordUserId,
        discordId: discordUserId,
        handle: discordUserId,
        role: "admin",
        lastSeenAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();
    row = inserted[0];
    if (!row) {
      const refetched = await db
        .select()
        .from(users)
        .where(eq(users.discordId, discordUserId))
        .limit(1);
      row = refetched[0];
    }
    if (!row) return { ok: false, reason: "could not upsert operator row" };
  } else {
    await db
      .update(users)
      .set({ lastSeenAt: new Date() })
      .where(eq(users.id, row.id));
  }

  if (row.banned) return { ok: false, reason: "user is banned" };
  if (ROLE_RANK[row.role] < ROLE_RANK[min]) {
    return {
      ok: false,
      reason: `requires ${min}, you are ${row.role}`,
    };
  }
  return { ok: true, user: row };
}
