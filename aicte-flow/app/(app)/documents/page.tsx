import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { getNow } from "@/lib/clock";
import { DocumentTable } from "./DocumentTable";

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const now = await getNow();

  const where: Record<string, unknown> = {};
  if (user.role === "INSTITUTION") where.institutionId = user.institutionId;
  if (user.role === "REGIONAL_OFFICER") where.institution = { regionId: user.regionId };

  const documents = await prisma.instDocument.findMany({
    where,
    include: { institution: { select: { name: true } } },
    orderBy: { validUntil: "asc" },
  });

  const expiring90 = documents.filter(
    (d) =>
      differenceInCalendarDays(d.validUntil, now) <= 90 &&
      differenceInCalendarDays(d.validUntil, now) >= 0 &&
      d.status !== "RENEWAL_SUBMITTED"
  ).length;

  const expired = documents.filter(
    (d) => d.status === "EXPIRED" || differenceInCalendarDays(d.validUntil, now) < 0
  ).length;

  const renewalPending = documents.filter((d) => d.status === "RENEWAL_SUBMITTED").length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Documents & Lease Validity</h1>
          <p className="page-subtitle">{documents.length} registered compliance document(s)</p>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card amber">
          <div className="kpi-label">Expiring ≤90 days</div>
          <div className="kpi-value" style={{ color: "#f59e0b" }}>{expiring90}</div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-label">Expired</div>
          <div className="kpi-value" style={{ color: "#ef4444" }}>{expired}</div>
        </div>
        <div className="kpi-card amber">
          <div className="kpi-label">Renewal Pending</div>
          <div className="kpi-value" style={{ color: "#f59e0b" }}>{renewalPending}</div>
          <div className="kpi-sub">Awaiting verification</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">Valid</div>
          <div className="kpi-value" style={{ color: "#22c55e" }}>
            {documents.length - expiring90 - expired - renewalPending}
          </div>
        </div>
      </div>

      <DocumentTable
        documents={documents.map((d) => ({
          id: d.id,
          institutionName: d.institution.name,
          docType: d.docType,
          title: d.title,
          validFrom: d.validFrom.toISOString(),
          validUntil: d.validUntil.toISOString(),
          status: d.status,
        }))}
        userRole={user.role}
        currentDateIso={now.toISOString()}
      />
    </div>
  );
}
