import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma, runTx } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { getNow } from "@/lib/clock";
import { formatStatus } from "@/lib/format";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["BUREAU_OFFICER", "ADMIN"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Only Bureau Officers can record decisions" }, { status: 403 });

  const { decision, remarks, undertaking } = await request.json();
  if (!decision || !remarks || remarks.trim().length < 5) {
    return NextResponse.json({ error: "Decision and remarks are required" }, { status: 400 });
  }

  const app = await prisma.application.findUnique({ where: { id } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (app.currentStageKey !== "DECISION_PENDING") {
    return NextResponse.json({ error: "Application is not at decision stage" }, { status: 409 });
  }

  const now = await getNow();
  let createdUndertakingId: string | null = null;

  const updated = await runTx(async (tx) => {
    const currentStageRecord = await tx.applicationStage.findFirst({
      where: { applicationId: id, stageKey: "DECISION_PENDING", exitedAt: null },
      orderBy: { enteredAt: "desc" },
    });

    if (currentStageRecord) {
      await tx.applicationStage.update({
        where: { id: currentStageRecord.id },
        data: { exitedAt: now, outcome: "DECIDED", notes: `${decision}: ${remarks}` },
      });
    }

    await tx.deadlineItem.updateMany({
      where: { refId: id, refType: "Application", state: "OPEN" },
      data: { state: "SATISFIED", closedAt: now },
    });

    if (decision === "APPROVED_WITH_CONDITIONS" && undertaking?.title) {
      const dueInDays = Math.max(1, Number(undertaking.dueInDays) || 90);
      const dueDate = new Date(now.getTime() + dueInDays * 86400000);
      const ut = await tx.undertaking.create({
        data: {
          applicationId: id,
          institutionId: app.institutionId,
          title: String(undertaking.title),
          condition: String(undertaking.condition || "Comply with stipulated AICTE conditions."),
          dueDate,
          status: "PENDING",
          grantedAt: now,
        },
      });
      createdUndertakingId = ut.id;

      await tx.deadlineItem.create({
        data: {
          kind: "UNDERTAKING",
          refType: "Undertaking",
          refId: ut.id,
          institutionId: app.institutionId,
          regionId: app.regionId,
          title: `Undertaking: ${ut.title.slice(0, 50)}`,
          dueAt: dueDate,
          state: "OPEN",
          applicationId: id,
          undertakingId: ut.id,
        },
      });
    }

    await tx.observation.create({
      data: {
        applicationId: id,
        stageKey: "DECISION_PENDING",
        authorId: user.id,
        text: `Decision: ${formatStatus(decision)}\nRemarks: ${remarks}`,
        kind: "OBSERVATION",
      },
    });

    return tx.application.update({
      where: { id },
      data: { status: "DECIDED", updatedAt: now },
    });
  });

  await appendAudit({
    actorId: user.id, actorRole: user.role, action: "DECISION_RECORDED",
    entityType: "Application", entityId: id, payload: { decision, remarks },
  });

  if (createdUndertakingId) {
    await appendAudit({
      actorId: user.id,
      actorRole: user.role,
      action: "UNDERTAKING_GRANTED",
      entityType: "Undertaking",
      entityId: createdUndertakingId,
      payload: { applicationId: id, title: undertaking.title },
    });
  }

  return NextResponse.json(updated);
}
