import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appendAudit } from "@/lib/audit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { text, kind = "OBSERVATION" } = await request.json();
  if (!text || text.trim().length === 0) return NextResponse.json({ error: "Text is required" }, { status: 400 });

  const app = await prisma.application.findUnique({ where: { id } });
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const obs = await prisma.observation.create({
    data: { applicationId: id, stageKey: app.currentStageKey, authorId: user.id, text, kind },
  });

  await appendAudit({
    actorId: user.id, actorRole: user.role, action: "OBSERVATION_ADDED",
    entityType: "Application", entityId: id, payload: { kind, text },
  });

  return NextResponse.json(obs);
}
