import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appendAudit } from "@/lib/audit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["BUREAU_OFFICER", "ADMIN"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Only Bureau Officers can record decisions" }, { status: 403 });

  const { decision, remarks } = await request.json();
  if (!decision || !remarks || remarks.trim().length < 5) {
    return NextResponse.json({ error: "Decision and remarks are required" }, { status: 400 });
  }

  const app = await prisma.application.findUnique({ where: { id } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (app.currentStageKey !== "DECISION_PENDING") {
    return NextResponse.json({ error: "Application is not at decision stage" }, { status: 409 });
  }

  const updated = await prisma.application.update({
    where: { id },
    data: { status: "DECIDED" },
  });

  await prisma.observation.create({
    data: {
      applicationId: id,
      stageKey: "DECISION_PENDING",
      authorId: user.id,
      text: `DECISION: ${decision}\n\nRemarks: ${remarks}`,
      kind: "OBSERVATION",
    },
  });

  await appendAudit({
    actorId: user.id, actorRole: user.role, action: "DECISION_RECORDED",
    entityType: "Application", entityId: id, payload: { decision, remarks },
  });

  return NextResponse.json(updated);
}
