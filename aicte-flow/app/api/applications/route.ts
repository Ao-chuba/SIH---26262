import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma, runTx } from "@/lib/db";
import { routeApplication } from "@/lib/workflow/workflow";
import { appendAudit } from "@/lib/audit";
import { APP_TYPE_ROUTE_MAP } from "@/config/rules";
import { buildMetrics, isValidIntake, requiredFaculty } from "@/lib/aph";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const user = await requireAuth().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const where: Record<string, unknown> = {};
  if (user.role === "INSTITUTION") where.institutionId = user.institutionId;
  if (user.role === "REGIONAL_OFFICER") {
    where.regionId = user.regionId; // never trust client regionId for RO
  } else if (
    (user.role === "BUREAU_OFFICER" || user.role === "ADMIN") &&
    searchParams.get("regionId")
  ) {
    where.regionId = searchParams.get("regionId");
  }
  if (user.role === "EVC_COMMITTEE") {
    where.OR = [
      { evcVisit: { committeeId: user.id } },
      { currentStageKey: { in: ["EVC_QUEUE", "EVC_SCHEDULED", "EVC_REPORT"] }, evcVisit: { committeeId: null } },
    ];
  }
  if (user.role === "SAC_SHC_MEMBER") where.currentStageKey = "SAC_SHC";
  if (searchParams.get("status")) where.status = searchParams.get("status");
  if (searchParams.get("stage") && user.role !== "SAC_SHC_MEMBER") {
    where.currentStageKey = searchParams.get("stage");
  }

  const apps = await prisma.application.findMany({
    where,
    include: { institution: { select: { name: true } }, assignedTo: { select: { name: true } } },
    orderBy: { stageEnteredAt: "asc" },
    take: 200,
  });

  return NextResponse.json(apps);
}

const createSchema = z.object({
  applicationType: z.enum(["NEW_INSTITUTION", "NEW_COURSE", "EXTENSION", "INTAKE_INCREASE", "CLOSURE", "OTHER"]),
  details: z.string().optional(),
  studentIntake: z.number().int().positive().optional(),
  facultyCount: z.number().int().nonnegative().optional(),
});

export async function POST(request: NextRequest) {
  const user = await requireAuth().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "INSTITUTION" && user.role !== "ADMIN") return NextResponse.json({ error: "Only institutions can submit applications" }, { status: 403 });

  const body = await request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { applicationType, studentIntake, facultyCount, details } = parsed.data;
  const fallbackInst = user.institutionId
    ? null
    : await prisma.institution.findFirst({ select: { id: true } });
  const institutionId = user.institutionId ?? fallbackInst?.id;
  if (!institutionId) {
    return NextResponse.json({ error: "No institution available for submission" }, { status: 400 });
  }
  const institution = await prisma.institution.findUniqueOrThrow({ where: { id: institutionId } });

  const intake = studentIntake ?? 60;
  const aphWarnings: string[] = [];
  if (!isValidIntake(intake)) {
    aphWarnings.push(`${intake} seats is not a standard APH division of 30/60.`);
  }

  const route = APP_TYPE_ROUTE_MAP[applicationType] ?? "ONLY_SCRUTINY";
  const refNo = `APP-${Date.now().toString(36).slice(-6)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  const metrics = buildMetrics(intake, true);
  if (typeof facultyCount === "number") {
    metrics.facultyCount = facultyCount;
    const req = requiredFaculty(intake);
    if (facultyCount < req) {
      aphWarnings.push(`${facultyCount} faculty for ${intake} intake is below the assistive 1:20 benchmark (need ${req}).`);
    }
  }
  metrics.studentIntake = intake;
  metrics.requiredLabAreaSqm = Math.ceil(intake * 5);

  const app = await prisma.application.create({
    data: {
      refNo,
      institutionId,
      regionId: institution.regionId,
      applicationType,
      route,
      currentStageKey: "SCRUTINY",
      status: "IN_PROGRESS",
      metricsJson: JSON.stringify(metrics),
      stageEnteredAt: new Date(),
    },
  });

  try {
    await routeApplication(app.id, user);
  } catch (error) {
    await runTx(async (tx) => {
      await tx.notification.deleteMany({ where: { applicationId: app.id } });
      await tx.deadlineItem.deleteMany({ where: { applicationId: app.id } });
      await tx.applicationStage.deleteMany({ where: { applicationId: app.id } });
      await tx.observation.deleteMany({ where: { applicationId: app.id } });
      await tx.application.delete({ where: { id: app.id } });
    }).catch(() => undefined);
    const message = error instanceof Error ? error.message : "Failed to route application";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  if (details?.trim()) {
    await prisma.observation.create({
      data: {
        applicationId: app.id,
        stageKey: "SCRUTINY",
        authorId: user.id,
        text: details.trim(),
        kind: "OBSERVATION",
      },
    });
  }

  await appendAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "APPLICATION_CREATED",
    entityType: "Application",
    entityId: app.id,
    payload: { refNo, applicationType, institutionId, details: details?.trim() || null },
  });

  const routedApp = await prisma.application.findUniqueOrThrow({ where: { id: app.id } });
  return NextResponse.json({ ...routedApp, aphWarnings }, { status: 201 });
}
