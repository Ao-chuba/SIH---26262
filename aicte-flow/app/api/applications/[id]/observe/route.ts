import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  authErrorResponse,
  canActOnApplication,
  requireAuth,
} from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appendAudit } from "@/lib/audit";

const OFFICER_ROLES = new Set([
  "REGIONAL_OFFICER",
  "BUREAU_OFFICER",
  "EVC_COMMITTEE",
  "SAC_SHC_MEMBER",
  "ADMIN",
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await requireAuth();
    if (!OFFICER_ROLES.has(user.role)) {
      throw new AuthError("Only officers can add observations", 403);
    }

    const { text, kind = "OBSERVATION" } = await request.json();
    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const app = await prisma.application.findUnique({ where: { id } });
    if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!canActOnApplication(user, app)) {
      throw new AuthError("Outside your jurisdiction for this file", 403);
    }
    if (user.role === "REGIONAL_OFFICER" && user.regionId !== app.regionId) {
      throw new AuthError("Outside your regional jurisdiction", 403);
    }

    const obs = await prisma.observation.create({
      data: { applicationId: id, stageKey: app.currentStageKey, authorId: user.id, text, kind },
    });

    await appendAudit({
      actorId: user.id,
      actorRole: user.role,
      action: "OBSERVATION_ADDED",
      entityType: "Application",
      entityId: id,
      payload: { kind, text },
    });

    return NextResponse.json(obs);
  } catch (e: unknown) {
    if (e instanceof AuthError) return authErrorResponse(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
