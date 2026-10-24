import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  assertInstitutionAccess,
  authErrorResponse,
  requireRole,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { getNow } from "@/lib/clock";
import { STAGES } from "@/config/rules";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await requireRole(["INSTITUTION", "ADMIN"]);
    const { text } = await request.json();
    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "Text required" }, { status: 400 });
    }

    const app = await prisma.application.findUnique({ where: { id } });
    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
    assertInstitutionAccess(user, app.institutionId);
    if (app.status !== "RETURNED") {
      return NextResponse.json({ error: "Application is not in returned state" }, { status: 409 });
    }

    const now = await getNow();
    const reScrutinyDays = STAGES.RE_SCRUTINY?.timelineDays ?? 7;

    await prisma.$transaction(async (tx) => {
      await tx.observation.create({
        data: { applicationId: id, stageKey: app.currentStageKey, authorId: user.id, text, kind: "REPLY" },
      });

      await tx.deadlineItem.updateMany({
        where: { refId: id, refType: "Application", state: "OPEN", kind: "STAGE_TIMELINE" },
        data: { state: "SATISFIED", closedAt: now },
      });

      // Return already opened a RE_SCRUTINY stage row — reuse it for officer re-scrutiny
      const openReturnStage = await tx.applicationStage.findFirst({
        where: { applicationId: id, stageKey: "RE_SCRUTINY", exitedAt: null },
        orderBy: { enteredAt: "desc" },
      });
      if (openReturnStage) {
        await tx.applicationStage.update({
          where: { id: openReturnStage.id },
          data: {
            notes: `Institution replied — officer re-scrutiny\n${text.slice(0, 200)}`,
          },
        });
      } else {
        await tx.applicationStage.create({
          data: {
            applicationId: id,
            stageKey: "RE_SCRUTINY",
            enteredAt: now,
            enteredById: user.id,
          },
        });
      }

      await tx.application.update({
        where: { id },
        data: { status: "IN_PROGRESS", currentStageKey: "RE_SCRUTINY", stageEnteredAt: now, updatedAt: now },
      });

      await tx.deadlineItem.create({
        data: {
          kind: "STAGE_TIMELINE",
          refType: "Application",
          refId: id,
          institutionId: app.institutionId,
          regionId: app.regionId,
          ownerUserId: app.assignedToId,
          title: `${app.refNo} – Re-Scrutiny deadline`,
          dueAt: new Date(now.getTime() + reScrutinyDays * 86400000),
          applicationId: id,
        },
      });
    });

    await appendAudit({
      actorId: user.id,
      actorRole: user.role,
      action: "REPLY_RECEIVED",
      entityType: "Application",
      entityId: id,
      payload: { text },
    });

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
  } catch (e: unknown) {
    if (e instanceof AuthError) return authErrorResponse(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
