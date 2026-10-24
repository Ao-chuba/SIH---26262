import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getNow } from "@/lib/clock";
import { UndertakingTable } from "./UndertakingTable";

export default async function UndertakingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const now = await getNow();

  if (!["INSTITUTION", "REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"].includes(user.role)) {
    redirect("/dashboard");
  }

  const where: Record<string, unknown> = {};
  if (user.role === "INSTITUTION") where.institutionId = user.institutionId;
  if (user.role === "REGIONAL_OFFICER") where.institution = { regionId: user.regionId };

  const undertakings = await prisma.undertaking.findMany({
    where,
    include: {
      application: { select: { refNo: true } },
      institution: { select: { name: true } },
      evidence: { orderBy: { uploadedAt: "desc" }, take: 1 },
    },
    orderBy: { dueDate: "asc" },
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Undertakings</h1>
          <p className="page-subtitle">{undertakings.length} conditional approval undertaking(s)</p>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {[
          { status: "PENDING", label: "Pending", cls: "", color: undefined },
          { status: "SUBMITTED", label: "Submitted", cls: "amber", color: "var(--amber)" },
          { status: "VERIFIED", label: "Verified", cls: "green", color: "var(--green)" },
          { status: "OVERDUE", label: "Overdue", cls: "red", color: "var(--red)" },
        ].map((item) => (
          <div key={item.status} className={`kpi-card ${item.cls}`}>
            <div className="kpi-label">{item.label}</div>
            <div className="kpi-value" style={{ color: item.color }}>
              {undertakings.filter((u) => u.status === item.status).length}
            </div>
          </div>
        ))}
      </div>

      <UndertakingTable
        undertakings={undertakings.map((u) => ({
          id: u.id,
          applicationId: u.applicationId,
          applicationRefNo: u.application.refNo,
          institutionName: u.institution.name,
          title: u.title,
          condition: u.condition,
          dueDate: u.dueDate.toISOString(),
          status: u.status,
          remarks: u.remarks,
          evidence: u.evidence[0]
            ? { id: u.evidence[0].id, fileName: u.evidence[0].fileName, note: u.evidence[0].note }
            : null,
        }))}
        userRole={user.role}
        currentDateIso={now.toISOString()}
      />
    </div>
  );
}
