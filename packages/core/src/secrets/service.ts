import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { secrets } from "../db/schema.js";
import { newId, type SecretScope } from "@tent/shared";
import { encryptSecret, decryptSecret } from "./crypto.js";

interface ScopeKey {
  scope: SecretScope;
  scopeRef?: string | null;
  key: string;
}

function scopeCondition(scope: SecretScope, scopeRef?: string | null) {
  if (scopeRef == null) {
    return and(eq(secrets.scope, scope), isNull(secrets.scopeRef));
  }
  return and(eq(secrets.scope, scope), eq(secrets.scopeRef, scopeRef));
}

export const SecretService = {
  async set({ scope, scopeRef, key }: ScopeKey, value: string): Promise<void> {
    const enc = await encryptSecret(value);
    const db = getDb();

    const existing = await db
      .select({ id: secrets.id })
      .from(secrets)
      .where(and(scopeCondition(scope, scopeRef), eq(secrets.key, key)))
      .limit(1);

    if (existing[0]) {
      await db
        .update(secrets)
        .set({
          ciphertext: enc.ciphertext,
          nonce: enc.nonce,
          rotatedAt: new Date(),
        })
        .where(eq(secrets.id, existing[0].id));
      return;
    }

    await db.insert(secrets).values({
      id: newId("secret"),
      scope,
      scopeRef: scopeRef ?? null,
      key,
      ciphertext: enc.ciphertext,
      nonce: enc.nonce,
    });
  },

  async get({ scope, scopeRef, key }: ScopeKey): Promise<string | null> {
    const db = getDb();
    const rows = await db
      .select({ ciphertext: secrets.ciphertext, nonce: secrets.nonce })
      .from(secrets)
      .where(and(scopeCondition(scope, scopeRef), eq(secrets.key, key)))
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    return decryptSecret({ ciphertext: row.ciphertext, nonce: row.nonce });
  },

  async list({ scope, scopeRef }: { scope: SecretScope; scopeRef?: string | null }) {
    const db = getDb();
    return db
      .select({
        id: secrets.id,
        scope: secrets.scope,
        scopeRef: secrets.scopeRef,
        key: secrets.key,
        createdAt: secrets.createdAt,
        rotatedAt: secrets.rotatedAt,
      })
      .from(secrets)
      .where(scopeCondition(scope, scopeRef));
  },

  async delete({ scope, scopeRef, key }: ScopeKey): Promise<void> {
    await getDb()
      .delete(secrets)
      .where(and(scopeCondition(scope, scopeRef), eq(secrets.key, key)));
  },

  async deleteAllForScope({ scope, scopeRef }: { scope: SecretScope; scopeRef: string }) {
    await getDb()
      .delete(secrets)
      .where(scopeCondition(scope, scopeRef));
  },
};

