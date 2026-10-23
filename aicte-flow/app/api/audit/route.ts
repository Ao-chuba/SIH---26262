import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { verifyAuditChain } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const user = await requireRole(["ADMIN", "BUREAU_OFFICER", "REGIONAL_OFFICER"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");
  const entityType = searchParams.get("entityType");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const format = searchParams.get("format");

  const where: Record<string, unknown> = {};
  if (action) where.action = action;
  if (entityType) where.entityType = entityType;
  if (from || to) {
    where.ts = {};
    if (from) (where.ts as Record<string, unknown>).gte = new Date(from);
    if (to) (where.ts as Record<string, unknown>).lte = new Date(to);
  }

  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { seq: "desc" },
    take: 500,
    include: { actor: { select: { name: true } } },
  });

  if (format === "csv") {
    const rows = [
      ["Seq", "Timestamp", "Actor", "Role", "Action", "Entity Type", "Entity ID", "SHA-256 Hash"],
      ...logs.map((l) => [
        String(l.seq),
        l.ts.toISOString(),
        l.actor?.name ?? "System",
        l.actorRole ?? "SYSTEM",
        l.action,
        l.entityType,
        l.entityId,
        l.hash,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    return new NextResponse(csv, {
      headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=audit-ledger.csv" },
    });
  }

  return NextResponse.json(logs);
}
