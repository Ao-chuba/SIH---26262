import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appendAudit } from "@/lib/audit";

const BACKUP_KEY = "AUDIT_TAMPER_DEMO_BACKUP";

/**
 * Admin-only demo helpers: mutate one audit payload without updating its hash
 * so Verify Chain shows a break; Restore puts the original payload back.
 */
export async function POST(request: NextRequest) {
  const user = await requireRole(["ADMIN"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = body.action === "restore" ? "restore" : "simulate";

  if (action === "simulate") {
    const existing = await prisma.ruleConfig.findUnique({ where: { key: BACKUP_KEY } });
    if (existing) {
      return NextResponse.json(
        { error: "Tamper already active. Restore first.", active: true },
        { status: 409 }
      );
    }

    const target = await prisma.auditLog.findFirst({
      where: { seq: { gt: 1 } },
      orderBy: { seq: "asc" },
    });
    if (!target) {
      return NextResponse.json({ error: "No audit rows to tamper" }, { status: 400 });
    }

    const backup = JSON.stringify({
      seq: target.seq,
      payload: target.payload,
    });

    let tamperedPayload: string;
    try {
      const obj = JSON.parse(target.payload) as Record<string, unknown>;
      obj.__TAMPERED__ = true;
      tamperedPayload = JSON.stringify(obj);
    } catch {
      tamperedPayload = JSON.stringify({ raw: target.payload, __TAMPERED__: true });
    }

    await prisma.$transaction([
      prisma.ruleConfig.upsert({
        where: { key: BACKUP_KEY },
        create: { key: BACKUP_KEY, value: backup, updatedById: user.id },
        update: { value: backup, updatedById: user.id },
      }),
      prisma.auditLog.update({
        where: { seq: target.seq },
        data: { payload: tamperedPayload },
      }),
    ]);

    // Do NOT appendAudit for the payload mutate itself — that would hide the break.
    // Log a separate meta action that is a new chain tip.
    await appendAudit({
      actorId: user.id,
      actorRole: user.role,
      action: "AUDIT_INTEGRITY_TEST",
      entityType: "AuditLog",
      entityId: String(target.seq),
      payload: { seq: target.seq, note: "Integrity test: payload mutated without hash update" },
    });

    return NextResponse.json({
      ok: true,
      action: "simulate",
      brokenAtSeq: target.seq,
      message: `Sequence #${target.seq} payload modified without updating its SHA-256 hash.`,
    });
  }

  // restore
  const backupRow = await prisma.ruleConfig.findUnique({ where: { key: BACKUP_KEY } });
  if (!backupRow) {
    return NextResponse.json({ error: "No active tamper backup", active: false }, { status: 404 });
  }

  const backup = JSON.parse(backupRow.value) as { seq: number; payload: string };
  await prisma.$transaction([
    prisma.auditLog.update({
      where: { seq: backup.seq },
      data: { payload: backup.payload },
    }),
    prisma.ruleConfig.delete({ where: { key: BACKUP_KEY } }),
  ]);

  await appendAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "AUDIT_TAMPER_RESTORED",
    entityType: "AuditLog",
    entityId: String(backup.seq),
    payload: { seq: backup.seq },
  });

  return NextResponse.json({
    ok: true,
    action: "restore",
    restoredSeq: backup.seq,
    message: `Sequence #${backup.seq} restored to original payload.`,
  });
}

export async function GET() {
  const user = await requireRole(["ADMIN"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  const backup = await prisma.ruleConfig.findUnique({ where: { key: BACKUP_KEY } });
  return NextResponse.json({ active: !!backup, backup: backup ? JSON.parse(backup.value) : null });
}
