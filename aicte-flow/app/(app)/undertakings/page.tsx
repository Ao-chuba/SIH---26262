import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getNow } from "@/lib/clock";
import { UndertakingTable } from "./UndertakingTable";

export default async function UndertakingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const now = await getNow();

  const where: Record<string, unknown> = {};
  if (user.role === "INSTITUTION") where.institutionId = user.institutionId;
  if (user.role === "REGIONAL_OFFICER") where.institution = { regionId: user.regionId };

  const undertakings = await prisma.undertaking.findMany({
    where,
    include: {
      application: { select: { refNo: true } },
      institution: { select: { name: true } },
    },
    orderBy: { dueDate: "asc" },
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Undertakings & Statutory Conditions</h1>
          <p className="page-subtitle">{undertakings.length} conditional approval undertaking(s)</p>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {["PENDING", "SUBMITTED", "VERIFIED", "OVERDUE"].map((status) => (
          <div
            key={status}
            className={`kpi-card ${
              status === "OVERDUE" ? "red" : status === "SUBMITTED" ? "amber" : status === "VERIFIED" ? "green" : ""
            }`}
          >
            <div className="kpi-label">{status}</div>
            <div
              className="kpi-value"
              style={{
                color: status === "OVERDUE" ? "#ef4444" : status === "VERIFIED" ? "#22c55e" : undefined,
              }}
            >
              {undertakings.filter((u) => u.status === status).length}
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
        }))}
        userRole={user.role}
        currentDateIso={now.toISOString()}
      />
    </div>
  );
}
