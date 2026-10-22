import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text } = await request.json();
  if (!text || text.trim().length === 0) return NextResponse.json({ error: "Text required" }, { status: 400 });

  const app = await prisma.application.findUnique({ where: { id } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (app.status !== "RETURNED") return NextResponse.json({ error: "Application is not in returned state" }, { status: 409 });

  await prisma.$transaction(async (tx) => {
    await tx.observation.create({
      data: { applicationId: id, stageKey: app.currentStageKey, authorId: user.id, text, kind: "REPLY" },
    });

    await tx.application.update({
      where: { id },
      data: { status: "IN_PROGRESS", currentStageKey: "RE_SCRUTINY" },
    });
  });

  await appendAudit({
    actorId: user.id, actorRole: user.role, action: "REPLY_RECEIVED",
    entityType: "Application", entityId: id, payload: { text },
  });

  // Notify assigned officer
  if (app.assignedToId) {
    await notify({
      toUserId: app.assignedToId,
      kind: "INFO",
      subject: `Reply received: ${app.refNo}`,
      body: `The institution has replied to the return. Application has re-entered Re-Scrutiny.`,
      applicationId: id,
    });
  }

  return NextResponse.json({ ok: true });
}
