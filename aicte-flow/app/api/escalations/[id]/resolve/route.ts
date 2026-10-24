import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { getNow } from "@/lib/clock";
import { prisma, runTx } from "@/lib/db";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { note } = await request.json();
  if (!note?.trim() || note.trim().length < 5) {
    return NextResponse.json({ error: "Resolution note must be at least 5 characters" }, { status: 400 });
  }

  const item = await prisma.deadlineItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "Escalation not found" }, { status: 404 });
  if (user.role === "REGIONAL_OFFICER" && item.regionId !== user.regionId) {
    return NextResponse.json({ error: "Outside your regional jurisdiction" }, { status: 403 });
  }
  if (item.escalationResolvedAt) {
    return NextResponse.json({ error: "Escalation is already resolved" }, { status: 409 });
  }

  const now = await getNow();
  await runTx(async (tx) => {
    await tx.deadlineItem.update({
      where: { id },
      data: {
        escalationResolvedAt: now,
        escalationResolveNote: note.trim(),
        escalationLevel: 0,
      },
    });
    await tx.escalationEvent.updateMany({
      where: { deadlineItemId: id, resolvedAt: null },
      data: { resolvedAt: now, resolutionNote: note.trim(), resolvedById: user.id },
    });
    if (item.applicationId) {
      await tx.observation.create({
        data: {
          applicationId: item.applicationId,
          stageKey: "ESCALATION",
          authorId: user.id,
          text: `Escalation resolved: ${note.trim()}`,
          kind: "OBSERVATION",
        },
      });
    }
  });
  await appendAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "ESCALATION_RESOLVED",
    entityType: "DeadlineItem",
    entityId: id,
    payload: { note: note.trim() },
  });
  return NextResponse.json({ ok: true });
}
