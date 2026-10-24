import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getNow } from "@/lib/clock";
import { differenceInCalendarDays } from "date-fns";

async function csvResponse(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename=${filename}.csv` },
  });
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  const user = await requireRole(["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format");
  const now = await getNow();
  const isRo = user.role === "REGIONAL_OFFICER";
  const regionId = user.regionId!;
  const appRegionWhere = isRo ? { regionId } : {};
  const evcRegionWhere = isRo ? { application: { regionId } } : {};
  const instRegionWhere = isRo ? { institution: { regionId } } : {};
  const deadlineRegionWhere = isRo ? { regionId } : {};

  if (type === "pendency") {
    const apps = await prisma.application.findMany({
      where: appRegionWhere,
      include: { institution: { select: { name: true } }, deadlineItems: { where: { state: "OPEN", kind: "STAGE_TIMELINE" }, take: 1 } },
    });
    const data = apps.map((a) => {
      const dl = a.deadlineItems[0];
      return {
        refNo: a.refNo, institution: a.institution.name, applicationType: a.applicationType,
        route: a.route, currentStage: a.currentStageKey, status: a.status,
        daysSinceEntry: differenceInCalendarDays(now, a.stageEnteredAt),
        daysLeft: dl ? differenceInCalendarDays(dl.dueAt, now) : "N/A",
      };
    });
    if (format === "csv") return csvResponse([
      ["Ref No", "Institution", "Type", "Route", "Stage", "Status", "Days in Stage", "Days Left"],
      ...data.map((d) => [d.refNo, d.institution, d.applicationType, d.route, d.currentStage, d.status, String(d.daysSinceEntry), String(d.daysLeft)]),
    ], "pendency-report");
    return NextResponse.json(data);
  }

  if (type === "evc") {
    const visits = await prisma.evcVisit.findMany({
      where: evcRegionWhere,
      include: { application: { include: { institution: { select: { name: true, type: true } } } } },
    });
    const data = visits.map((v) => ({
      applicationRefNo: v.application.refNo, institution: v.application.institution.name,
      status: v.status, queuedAt: v.queuedAt.toISOString(), scheduledFor: v.scheduledFor?.toISOString() ?? "",
      completedAt: v.completedAt?.toISOString() ?? "", reportRef: v.reportRef ?? "", isNewInstitution: v.isNewInstitution,
    }));
    if (format === "csv") return csvResponse([
      ["Application Ref", "Institution", "Status", "Queued At", "Scheduled For", "Completed At", "Report Ref", "New Institution"],
      ...data.map((d) => [d.applicationRefNo, d.institution, d.status, d.queuedAt, d.scheduledFor, d.completedAt, d.reportRef, String(d.isNewInstitution)]),
    ], "evc-report");
    return NextResponse.json(data);
  }

  if (type === "undertakings") {
    const uts = await prisma.undertaking.findMany({
      where: instRegionWhere,
      include: { institution: { select: { name: true } }, application: { select: { refNo: true } } },
    });
    const data = uts.map((u) => ({
      title: u.title, institution: u.institution.name, applicationRefNo: u.application.refNo,
      status: u.status, dueDate: u.dueDate.toISOString(), daysLeft: differenceInCalendarDays(u.dueDate, now),
    }));
    if (format === "csv") return csvResponse([
      ["Title", "Institution", "Ref No", "Status", "Due Date", "Days Left/Overdue"],
      ...data.map((d) => [d.title, d.institution, d.applicationRefNo, d.status, d.dueDate, String(d.daysLeft)]),
    ], "undertakings-report");
    return NextResponse.json(data);
  }

  if (type === "documents") {
    const docs = await prisma.instDocument.findMany({
      where: instRegionWhere,
      include: { institution: { select: { name: true } } },
    });
    const data = docs.map((d) => ({
      title: d.title, institution: d.institution.name, docType: d.docType, status: d.status,
      validUntil: d.validUntil.toISOString(), daysLeft: differenceInCalendarDays(d.validUntil, now),
    }));
    if (format === "csv") return csvResponse([
      ["Title", "Institution", "Type", "Status", "Valid Until", "Days Left"],
      ...data.map((d) => [d.title, d.institution, d.docType, d.status, d.validUntil, String(d.daysLeft)]),
    ], "documents-report");
    return NextResponse.json(data);
  }

  if (type === "overdue") {
    const items = await prisma.deadlineItem.findMany({
      where: { state: "OPEN", dueAt: { lt: now }, ...deadlineRegionWhere },
      include: { application: { select: { refNo: true } } },
    });
    const data = items.map((i) => ({
      title: i.title, kind: i.kind, dueAt: i.dueAt.toISOString(),
      overdueDays: differenceInCalendarDays(now, i.dueAt), escalationLevel: i.escalationLevel,
    }));
    if (format === "csv") return csvResponse([
      ["Title", "Kind", "Due At", "Overdue Days", "Escalation Level"],
      ...data.map((d) => [d.title, d.kind, d.dueAt, String(d.overdueDays), String(d.escalationLevel)]),
    ], "overdue-report");
    return NextResponse.json(data);
  }

  if (type === "region-performance") {
    if (isRo) {
      return NextResponse.json({ error: "Regional officers cannot export all-region performance" }, { status: 403 });
    }
    const regions = await prisma.region.findMany();
    const data = await Promise.all(regions.map(async (r) => {
      const apps = await prisma.application.count({ where: { regionId: r.id } });
      const inSLA = await prisma.application.count({
        where: { regionId: r.id, deadlineItems: { some: { state: "OPEN", dueAt: { gte: now } } } },
      });
      return { region: r.name, totalApps: apps, inSLA, pctInSLA: apps > 0 ? ((inSLA / apps) * 100).toFixed(1) : "N/A" };
    }));
    if (format === "csv") return csvResponse([
      ["Region", "Total Applications", "Within SLA", "% Within SLA"],
      ...data.map((d) => [d.region, String(d.totalApps), String(d.inSLA), String(d.pctInSLA)]),
    ], "region-performance-report");
    return NextResponse.json(data);
  }

  return NextResponse.json({ error: "Unknown report type" }, { status: 404 });
}
