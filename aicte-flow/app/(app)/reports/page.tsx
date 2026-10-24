import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { STAGES } from "@/config/rules";
import { formatStage, formatStatus } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"].includes(user.role)) redirect("/dashboard");

  const regionWhere = user.role === "REGIONAL_OFFICER" ? { regionId: user.regionId! } : {};
  const evcRegionWhere = user.role === "REGIONAL_OFFICER" ? { application: { regionId: user.regionId! } } : {};
  const utRegionWhere = user.role === "REGIONAL_OFFICER" ? { institution: { regionId: user.regionId! } } : {};

  const [
    totalApps,
    inProgress,
    returned,
    decided,
    stageBreakdown,
    evcStats,
    undertakingStats,
    escalatedCount,
  ] = await Promise.all([
    prisma.application.count({ where: regionWhere }),
    prisma.application.count({ where: { ...regionWhere, status: "IN_PROGRESS" } }),
    prisma.application.count({ where: { ...regionWhere, status: "RETURNED" } }),
    prisma.application.count({ where: { ...regionWhere, status: "DECIDED" } }),
    prisma.application.groupBy({ by: ["currentStageKey"], where: regionWhere, _count: { id: true } }),
    prisma.evcVisit.groupBy({ by: ["status"], where: evcRegionWhere, _count: { id: true } }),
    prisma.undertaking.groupBy({ by: ["status"], where: utRegionWhere, _count: { id: true } }),
    prisma.deadlineItem.count({ where: { ...regionWhere, escalationLevel: { gt: 0 }, state: "OPEN" } }),
  ]);

  const reportCards = [
    {
      id: "pendency",
      title: "Application Pendency",
      num: "01",
      desc: "Stage-wise breakdown with ageing buckets.",
      exportUrl: "/api/reports/pendency?format=csv",
    },
    {
      id: "evc",
      title: "EVC Inspection Status",
      num: "02",
      desc: "Queued, scheduled, completed, and overdue visits.",
      exportUrl: "/api/reports/evc?format=csv",
    },
    {
      id: "undertakings",
      title: "Undertaking Compliance",
      num: "03",
      desc: "Granted, submitted, verified, and overdue undertakings.",
      exportUrl: "/api/reports/undertakings?format=csv",
    },
    {
      id: "documents",
      title: "Document & Lease Validity",
      num: "04",
      desc: "Valid, expiring (≤90 days), and expired documents.",
      exportUrl: "/api/reports/documents?format=csv",
    },
    {
      id: "overdue",
      title: "Overdue & Escalated Items",
      num: "05",
      desc: "All overdue deadline items with escalation levels.",
      exportUrl: "/api/reports/overdue?format=csv",
    },
    ...(user.role === "REGIONAL_OFFICER"
      ? []
      : [
          {
            id: "region-performance",
            title: "Regional SLA Performance",
            num: "06",
            desc: "Average stage duration and SLA compliance by region.",
            exportUrl: "/api/reports/region-performance?format=csv",
          },
        ]),
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Operational summaries and CSV exports</p>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card">
          <div className="kpi-label">Total Applications</div>
          <div className="kpi-value">{totalApps}</div>
        </div>
        <div className="kpi-card amber">
          <div className="kpi-label">In Progress</div>
          <div className="kpi-value" style={{ color: "var(--amber)" }}>{inProgress}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Returned</div>
          <div className="kpi-value">{returned}</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">Decided</div>
          <div className="kpi-value" style={{ color: "var(--green)" }}>{decided}</div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-label">Escalated</div>
          <div className="kpi-value" style={{ color: "var(--red)" }}>{escalatedCount}</div>
        </div>
      </div>

      {/* Report cards */}
      <div className="grid-2" style={{ marginBottom: 24 }}>
        {reportCards.map((r) => (
          <div key={r.id} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
              <span
                className="font-mono"
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  background: "var(--highlighter-yellow)",
                  color: "var(--forest)",
                  border: "1.5px solid var(--forest)",
                  padding: "5px 9px",
                  borderRadius: 10,
                  flexShrink: 0,
                }}
              >
                {r.num}
              </span>
              <div style={{ flex: 1 }}>
                <div className="card-title">{r.title}</div>
                <p style={{ fontSize: 12.5, color: "var(--forest-muted)", marginTop: 3 }}>{r.desc}</p>
              </div>
            </div>
            <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
              <a href={r.exportUrl} className="btn btn-secondary btn-sm">
                Export CSV &rarr;
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* Stage breakdown inline */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header">
          <span className="card-title">Applications by Stage</span>
          <span className="badge badge-gray">{totalApps} total</span>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Count</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {stageBreakdown.map((s) => {
              const pct = totalApps > 0 ? Math.round((s._count.id / totalApps) * 100) : 0;
              return (
                <tr key={s.currentStageKey}>
                  <td style={{ fontWeight: 700 }}>
                    {STAGES[s.currentStageKey]?.label ?? formatStage(s.currentStageKey)}
                  </td>
                  <td><strong>{s._count.id}</strong></td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, height: 10, background: "var(--bg-subtle)", borderRadius: 9999, overflow: "hidden", border: "1px solid var(--border)" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: "var(--forest)", borderRadius: 9999 }} />
                      </div>
                      <span className="font-mono" style={{ fontSize: 12, fontWeight: 700, width: 44 }}>{pct}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {stageBreakdown.length === 0 && (
              <tr><td colSpan={3}><div className="empty-state"><p>No application data available.</p></div></td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* EVC & Undertaking stats */}
      <div className="grid-2">
        <div className="card">
          <div className="card-header"><span className="card-title">EVC Status</span></div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {evcStats.map((e) => (
                <tr key={e.status}>
                  <td><span className="badge badge-blue">{formatStatus(e.status)}</span></td>
                  <td><strong>{e._count.id}</strong></td>
                </tr>
              ))}
              {evcStats.length === 0 && (
                <tr><td colSpan={2}><div className="empty-state"><p>No EVC records available.</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Undertakings</span></div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {undertakingStats.map((u) => (
                <tr key={u.status}>
                  <td><span className="badge badge-amber">{formatStatus(u.status)}</span></td>
                  <td><strong>{u._count.id}</strong></td>
                </tr>
              ))}
              {undertakingStats.length === 0 && (
                <tr><td colSpan={2}><div className="empty-state"><p>No undertaking records available.</p></div></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
