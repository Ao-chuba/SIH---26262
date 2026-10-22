import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { getNow } from "@/lib/clock";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"].includes(user.role)) redirect("/dashboard");

  const now = await getNow();

  const [
    totalApps, inProgress, returned, decided,
    stageBreakdown, evcStats, undertakingStats, docStats, escalatedCount,
    regions,
  ] = await Promise.all([
    prisma.application.count(),
    prisma.application.count({ where: { status: "IN_PROGRESS" } }),
    prisma.application.count({ where: { status: "RETURNED" } }),
    prisma.application.count({ where: { status: "DECIDED" } }),
    prisma.application.groupBy({ by: ["currentStageKey"], _count: { id: true } }),
    prisma.evcVisit.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.undertaking.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.instDocument.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.deadlineItem.count({ where: { escalationLevel: { gt: 0 }, state: "OPEN" } }),
    prisma.region.findMany(),
  ]);

  const reportCards = [
    {
      id: "pendency",
      title: "1. Application Pendency",
      icon: "📋",
      desc: "Stage-wise breakdown with ageing",
      exportUrl: "/api/reports/pendency?format=csv",
    },
    {
      id: "evc",
      title: "2. EVC Status",
      icon: "🔍",
      desc: "Queued/Scheduled/Completed/Overdue, new-institution split",
      exportUrl: "/api/reports/evc?format=csv",
    },
    {
      id: "undertakings",
      title: "3. Undertaking Compliance",
      icon: "📝",
      desc: "Granted/Verified/Overdue, % compliance",
      exportUrl: "/api/reports/undertakings?format=csv",
    },
    {
      id: "documents",
      title: "4. Document Validity",
      icon: "📄",
      desc: "Valid/Expiring/Expired by bucket",
      exportUrl: "/api/reports/documents?format=csv",
    },
    {
      id: "overdue",
      title: "5. Overdue Cases",
      icon: "⚠️",
      desc: "All kinds with escalation level",
      exportUrl: "/api/reports/overdue?format=csv",
    },
    {
      id: "region-performance",
      title: "6. Region-wise Performance",
      icon: "📈",
      desc: "Avg days per stage, % within SLA",
      exportUrl: "/api/reports/region-performance?format=csv",
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Six analytical reports with CSV export</p>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card"><div className="kpi-label">Total Applications</div><div className="kpi-value">{totalApps}</div></div>
        <div className="kpi-card amber"><div className="kpi-label">In Progress</div><div className="kpi-value" style={{ color: "#f59e0b" }}>{inProgress}</div></div>
        <div className="kpi-card"><div className="kpi-label">Returned</div><div className="kpi-value">{returned}</div></div>
        <div className="kpi-card green"><div className="kpi-label">Decided</div><div className="kpi-value" style={{ color: "#22c55e" }}>{decided}</div></div>
        <div className="kpi-card red"><div className="kpi-label">Escalated Items</div><div className="kpi-value" style={{ color: "#ef4444" }}>{escalatedCount}</div></div>
      </div>

      {/* Report cards */}
      <div className="grid-2" style={{ gap: 16, marginBottom: 24 }}>
        {reportCards.map((r) => (
          <div key={r.id} className="card">
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span style={{ fontSize: 28 }}>{r.icon}</span>
              <div style={{ flex: 1 }}>
                <div className="card-title">{r.title}</div>
                <p style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{r.desc}</p>
                <a href={r.exportUrl} className="btn btn-secondary btn-sm" style={{ marginTop: 12 }}>
                  ⬇️ Export CSV
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Stage breakdown inline */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>Application Pendency by Stage</div>
        <table className="data-table">
          <thead><tr><th>Stage</th><th>Count</th><th>% of In-Progress</th></tr></thead>
          <tbody>
            {stageBreakdown.map((s) => (
              <tr key={s.currentStageKey}>
                <td>{s.currentStageKey.replace(/_/g, " ")}</td>
                <td><strong>{s._count.id}</strong></td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 8, background: "#f0f4f8", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${inProgress > 0 ? (s._count.id / inProgress * 100) : 0}%`, height: "100%", background: "#2a5298", borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 12, width: 40 }}>{inProgress > 0 ? ((s._count.id / inProgress * 100).toFixed(0)) : 0}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* EVC stats */}
      <div className="grid-2" style={{ gap: 16 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>EVC Status Breakdown</div>
          <table className="data-table">
            <thead><tr><th>Status</th><th>Count</th></tr></thead>
            <tbody>
              {evcStats.map((e) => <tr key={e.status}><td>{e.status}</td><td><strong>{e._count.id}</strong></td></tr>)}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Undertaking Compliance</div>
          <table className="data-table">
            <thead><tr><th>Status</th><th>Count</th></tr></thead>
            <tbody>
              {undertakingStats.map((u) => <tr key={u.status}><td>{u.status}</td><td><strong>{u._count.id}</strong></td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
