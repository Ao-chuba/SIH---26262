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

  if (!["INSTITUTION", "REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"].includes(user.role)) {
    redirect("/dashboard");
  }

  const where: Record<string, unknown> = {};
  if (user.role === "INSTITUTION") where.institutionId = user.institutionId;
  if (user.role === "REGIONAL_OFFICER") where.institution = { regionId: user.regionId };

  const documents = await prisma.instDocument.findMany({
    where,
    include: {
      institution: { select: { name: true } },
      evidence: { orderBy: { uploadedAt: "desc" }, take: 1 },
    },
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
          <h1 className="page-title">Documents &amp; Leases</h1>
          <p className="page-subtitle">{documents.length} registered document(s)</p>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card amber">
          <div className="kpi-label">Expiring ≤90 Days</div>
          <div className="kpi-value" style={{ color: "var(--amber)" }}>{expiring90}</div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-label">Expired</div>
          <div className="kpi-value" style={{ color: "var(--red)" }}>{expired}</div>
        </div>
        <div className="kpi-card amber">
          <div className="kpi-label">Renewal Submitted</div>
          <div className="kpi-value" style={{ color: "var(--amber)" }}>{renewalPending}</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">Valid (&gt;90 Days)</div>
          <div className="kpi-value" style={{ color: "var(--green)" }}>
            {Math.max(0, documents.length - expiring90 - expired - renewalPending)}
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
          remarks: d.remarks,
          evidence: d.evidence[0]
            ? { id: d.evidence[0].id, fileName: d.evidence[0].fileName }
            : null,
        }))}
        userRole={user.role}
        currentDateIso={now.toISOString()}
      />
    </div>
  );
}
