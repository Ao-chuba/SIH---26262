import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
  if (user.role === "REGIONAL_OFFICER") where.regionId = user.regionId;
  if (searchParams.get("regionId")) where.regionId = searchParams.get("regionId");
  if (searchParams.get("status")) where.status = searchParams.get("status");
  if (searchParams.get("stage")) where.currentStageKey = searchParams.get("stage");

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

  const { applicationType, studentIntake, facultyCount } = parsed.data;
  const institutionId = user.institutionId!;
  const institution = await prisma.institution.findUniqueOrThrow({ where: { id: institutionId } });

  const intake = studentIntake ?? 60;
  if (!isValidIntake(intake)) {
    return NextResponse.json(
      {
        error: `APH intake gate: ${intake} seats is not a valid division of 30/60. Correct the intake before submission (e.g. 30, 60, 120, 180).`,
      },
      { status: 400 }
    );
  }

  const route = APP_TYPE_ROUTE_MAP[applicationType] ?? "ONLY_SCRUTINY";
  const refNo = `APP-${Date.now().toString().slice(-8)}`;
  const metrics = buildMetrics(intake, true);
  if (typeof facultyCount === "number") {
    metrics.facultyCount = facultyCount;
    const req = requiredFaculty(intake);
    if (facultyCount < req) {
      return NextResponse.json(
        {
          error: `APH faculty gate: ${facultyCount} faculty for ${intake} intake fails 1:20 (need ≥ ${req}). Fix before submission or file with an undertaking later.`,
        },
        { status: 400 }
      );
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

  await appendAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "APPLICATION_CREATED",
    entityType: "Application",
    entityId: app.id,
    payload: { refNo, applicationType, institutionId },
  });

  await routeApplication(app.id, user);

  return NextResponse.json(app, { status: 201 });
}
