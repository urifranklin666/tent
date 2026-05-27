import { getDb } from "../db/index.js";
import { auditLog } from "../db/schema.js";
import { newId } from "@tent/shared";

export interface AuditInput {
  actorUserId?: string | null;
  actorKind: "user" | "system" | "bot";
  action: string;
  targetKind?: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

export const AuditService = {
  async record(input: AuditInput): Promise<void> {
    await getDb()
      .insert(auditLog)
      .values({
        id: newId("audit"),
        actorUserId: input.actorUserId ?? null,
        actorKind: input.actorKind,
        action: input.action,
        targetKind: input.targetKind ?? null,
        targetId: input.targetId ?? null,
        details: (input.details ?? null) as never,
      });
  },
};
