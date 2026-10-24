import { createHash } from "crypto";
import { prisma, runTx } from "./db";

interface AuditParams {
  actorId?: string;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: unknown;
}

/**
 * Appends a tamper-evident audit log entry using a SHA-256 hash chain.
 * Each entry's hash includes the previous entry's hash, making tampering detectable.
 */
export async function appendAudit(params: AuditParams): Promise<void> {
  const { actorId, actorRole, action, entityType, entityId, payload } = params;
  const ts = new Date();

  await runTx(async (tx) => {
    const lastEntry = await tx.auditLog.findFirst({
      orderBy: { seq: "desc" },
      select: { hash: true },
    });
    const prevHash = lastEntry?.hash ?? "0".repeat(64);
    const serializedPayload = JSON.stringify(payload);
    const hash = createHash("sha256")
      .update(prevHash + ts.toISOString() + (actorId ?? "") + action + entityType + entityId + serializedPayload)
      .digest("hex");

    await tx.auditLog.create({
      data: {
        ts,
        actorId,
        actorRole,
        action,
        entityType,
        entityId,
        payload: serializedPayload,
        prevHash,
        hash,
      },
    });
  });
}

export async function verifyAuditChain(): Promise<{ ok: boolean; brokenAtSeq?: number }> {
  const entries = await prisma.auditLog.findMany({ orderBy: { seq: "asc" } });
  let prevHash = "0".repeat(64);

  for (const entry of entries) {
    if (entry.prevHash !== prevHash) {
      return { ok: false, brokenAtSeq: entry.seq };
    }
    const expected = createHash("sha256")
      .update(
        entry.prevHash +
          entry.ts.toISOString() +
          (entry.actorId ?? "") +
          entry.action +
          entry.entityType +
          entry.entityId +
          entry.payload
      )
      .digest("hex");
    if (expected !== entry.hash) {
      return { ok: false, brokenAtSeq: entry.seq };
    }
    prevHash = entry.hash;
  }
  return { ok: true };
}
