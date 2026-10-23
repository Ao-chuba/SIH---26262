import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { getNow } from "@/lib/clock";
import { computeHealthScore } from "@/lib/aph";
import Link from "next/link";
import { QuickLinks } from "../QuickLinks";

function SlaChip({ days, escalationLevel }: { days: number; escalationLevel?: number }) {
  if (escalationLevel && escalationLevel > 0) {
    return <span className="sla-chip purple">[ESC:L{escalationLevel}]</span>;
  }
  if (days < 0) return <span className="sla-chip red">[OVERDUE {Math.abs(days)}d]</span>;
  if (days <= 3) return <span className="sla-chip amber">[DUE {days}d]</span>;
  return <span className="sla-chip green">[OK {days}d]</span>;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const now = await getNow();
  const launchpad = (
    <QuickLinks
      userRole={user.role}
      regionId={user.regionId}
      institutionId={user.institutionId}
    />
  );

  if (user.role === "REGIONAL_OFFICER") {
    const [pending, myApps, evcCount, overdueUt, expiringDocs, escalated, regionInsts] = await Promise.all([
      prisma.application.count({ where: { regionId: user.regionId!, status: "IN_PROGRESS" } }),
      prisma.application.findMany({
        where: { regionId: user.regionId!, status: { in: ["IN_PROGRESS", "RETURNED"] } },
        include: { institution: { select: { name: true } }, deadlineItems: { where: { state: "OPEN", kind: "STAGE_TIMELINE" }, orderBy: { dueAt: "asc" }, take: 1 } },
        orderBy: { stageEnteredAt: "asc" },
        take: 20,
      }),
      prisma.evcVisit.count({ where: { status: "QUEUED", application: { regionId: user.regionId! } } }),
      prisma.undertaking.count({ where: { status: "OVERDUE", institution: { regionId: user.regionId! } } }),
      prisma.instDocument.count({ where: { status: { in: ["EXPIRING", "EXPIRED"] }, institution: { regionId: user.regionId! } } }),
      prisma.deadlineItem.count({ where: { regionId: user.regionId!, escalationLevel: { gt: 0 }, state: "OPEN" } }),
      prisma.institution.findMany({
        where: { regionId: user.regionId! },
        take: 8,
        include: {
          applications: { orderBy: { createdAt: "desc" }, take: 1, select: { metricsJson: true } },
          documents: { select: { status: true, validUntil: true } },
          undertakings: { select: { status: true } },
        },
      }),
    ]);
    const regionHealth = regionInsts
      .map((inst) => ({
        id: inst.id,
        name: inst.name,
        health: computeHealthScore({
          metricsJson: inst.applications[0]?.metricsJson ?? null,
          docs: inst.documents,
          undertakings: inst.undertakings,
          now,
        }),
      }))
      .sort((a, b) => a.health.score - b.health.score);

    const dueSoon = myApps.filter((a) => {
      const dl = a.deadlineItems[0];
      if (!dl) return false;
      return differenceInCalendarDays(dl.dueAt, now) <= 3;
    }).length;

    const overdue = myApps.filter((a) => {
      const dl = a.deadlineItems[0];
      if (!dl) return false;
      return differenceInCalendarDays(dl.dueAt, now) < 0;
    }).length;

    return (
      <div>
        {launchpad}
        <div className="page-header">
          <div>
            <h1 className="page-title">Regional Dashboard</h1>
            <p className="page-subtitle">{user.region?.name ?? ""} Region â€¢ {user.name}</p>
          </div>
        </div>

        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-label">My Pending</div><div className="kpi-value">{pending}</div><div className="kpi-sub">Applications in progress</div></div>
          <div className="kpi-card amber"><div className="kpi-label">Due â‰¤3 Days</div><div className="kpi-value" style={{ color: "#f59e0b" }}>{dueSoon}</div><div className="kpi-sub">Approaching deadline</div></div>
          <div className="kpi-card red"><div className="kpi-label">Overdue</div><div className="kpi-value" style={{ color: "#ef4444" }}>{overdue}</div><div className="kpi-sub">Past stage deadline</div></div>
          <div className="kpi-card purple"><div className="kpi-label">Escalated</div><div className="kpi-value" style={{ color: "#a855f7" }}>{escalated}</div><div className="kpi-sub">Need urgent attention</div></div>
          <div className="kpi-card"><div className="kpi-label">EVC Queue</div><div className="kpi-value">{evcCount}</div><div className="kpi-sub">Awaiting scheduling</div></div>
          <div className="kpi-card red"><div className="kpi-label">Overdue Undertakings</div><div className="kpi-value" style={{ color: "#ef4444" }}>{overdueUt}</div><div className="kpi-sub">Awaiting verification</div></div>
          <div className="kpi-card amber"><div className="kpi-label">Expiring Docs</div><div className="kpi-value" style={{ color: "#f59e0b" }}>{expiringDocs}</div><div className="kpi-sub">Within 90 days</div></div>
        </div>

        {regionHealth.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <span className="card-title">Institution Compliance Health (region)</span>
              <span style={{ fontSize: 11, color: "#64748b" }}>Assistive 0â€“100 Â· lowest first</span>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {regionHealth.map((row) => (
                <div key={row.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0f4f8" }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{row.name}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{row.health.score}</span>
                    <span className={`badge ${row.health.label === "HEALTHY" ? "badge-green" : row.health.label === "AT RISK" ? "badge-amber" : "badge-red"}`}>
                      {row.health.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <span className="card-title">My Worklist</span>
            <Link href="/applications" className="btn btn-secondary btn-sm">View All -&gt;</Link>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>Ref No</th><th>Institution</th><th>Stage</th><th>SLA</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {myApps.map((app) => {
                  const dl = app.deadlineItems[0];
                  const days = dl ? differenceInCalendarDays(dl.dueAt, now) : 999;
                  const esc = dl?.escalationLevel ?? 0;
                  return (
                    <tr key={app.id}>
                      <td><Link href={`/applications/${app.id}`} style={{ color: "#2a5298", fontWeight: 600 }}>{app.refNo}</Link></td>
                      <td>{app.institution.name}</td>
                      <td><span className="badge badge-blue">{app.currentStageKey.replace("_", " ")}</span></td>
                      <td><SlaChip days={days} escalationLevel={esc} /></td>
                      <td><span className={`badge ${app.status === "RETURNED" ? "badge-amber" : "badge-blue"}`}>{app.status}</span></td>
                      <td><Link href={`/applications/${app.id}`} className="btn btn-secondary btn-sm">Review</Link></td>
                    </tr>
                  );
                })}
                {myApps.length === 0 && <tr><td colSpan={6}><div className="empty-state"><p>No applications assigned.</p></div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (user.role === "BUREAU_OFFICER") {
    const [total, regions, appCountsByRegion, escalated, decidePending] = await Promise.all([
      prisma.application.count({ where: { status: "IN_PROGRESS" } }),
      prisma.region.findMany({
        include: {
          _count: { select: { institutions: true } },
        },
      }),
      prisma.application.groupBy({
        by: ["regionId"],
        where: { status: "IN_PROGRESS" },
        _count: { id: true },
      }),
      prisma.deadlineItem.count({ where: { escalationLevel: { gte: 2 }, state: "OPEN" } }),
      prisma.application.count({ where: { currentStageKey: "DECISION_PENDING" } }),
    ]);

    const appCountMap = Object.fromEntries(appCountsByRegion.map((g) => [g.regionId, g._count.id]));

    return (
      <div>
        {launchpad}
        <div className="page-header">
          <div>
            <h1 className="page-title">Bureau Dashboard</h1>
            <p className="page-subtitle">All Regions â€¢ {user.name}</p>
          </div>
        </div>

        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-label">Total In Progress</div><div className="kpi-value">{total}</div><div className="kpi-sub">Across all regions</div></div>
          <div className="kpi-card red"><div className="kpi-label">L2+ Escalations</div><div className="kpi-value" style={{ color: "#ef4444" }}>{escalated}</div><div className="kpi-sub">Require bureau action</div></div>
          <div className="kpi-card amber"><div className="kpi-label">Decision Pending</div><div className="kpi-value" style={{ color: "#f59e0b" }}>{decidePending}</div><div className="kpi-sub">Awaiting competent authority</div></div>
        </div>

        <div className="card">
          <div className="card-header"><span className="card-title">Region-wise Pendency</span></div>
          <table className="data-table">
            <thead><tr><th>Region</th><th>Institutions</th><th>In Progress</th><th>Actions</th></tr></thead>
            <tbody>
              {regions.map((r) => (
                <tr key={r.id}>
                  <td><strong>{r.name}</strong><br /><small style={{ color: "#64748b" }}>{r.headquarters}</small></td>
                  <td>{r._count.institutions}</td>
                  <td><span className="badge badge-blue">{appCountMap[r.id] ?? 0}</span></td>
                  <td><Link href={`/applications?regionId=${r.id}`} className="btn btn-secondary btn-sm">View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (user.role === "EVC_COMMITTEE" || user.role === "SAC_SHC_MEMBER") {
    const [queued, scheduled, overdue] = await Promise.all([
      prisma.evcVisit.count({ where: { status: "QUEUED" } }),
      prisma.evcVisit.count({ where: { status: "SCHEDULED" } }),
      prisma.evcVisit.findMany({
        where: { status: "SCHEDULED", scheduledFor: { lt: now } },
        include: { application: { include: { institution: { select: { name: true } } } } },
        take: 10,
      }),
    ]);

    return (
      <div>
        {launchpad}
        <div className="page-header">
          <div>
            <h1 className="page-title">EVC Committee Dashboard</h1>
            <p className="page-subtitle">{user.name}</p>
          </div>
        </div>
        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-label">Queued for EVC</div><div className="kpi-value">{queued}</div></div>
          <div className="kpi-card amber"><div className="kpi-label">Scheduled Visits</div><div className="kpi-value" style={{ color: "#f59e0b" }}>{scheduled}</div></div>
          <div className="kpi-card red"><div className="kpi-label">Overdue Visits</div><div className="kpi-value" style={{ color: "#ef4444" }}>{overdue.length}</div></div>
        </div>
        {overdue.length > 0 && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 16 }}>[!] Overdue EVC Visits</div>
            <table className="data-table">
              <thead><tr><th>Application</th><th>Institution</th><th>Scheduled For</th><th>Overdue</th></tr></thead>
              <tbody>
                {overdue.map((v) => (
                  <tr key={v.id}>
                    <td><Link href={`/applications/${v.applicationId}`} style={{ color: "#2a5298" }}>{v.application.institution.name}</Link></td>
                    <td>{v.application.institution.name}</td>
                    <td>{v.scheduledFor?.toLocaleDateString()}</td>
                    <td><span className="sla-chip red">[OVERDUE {differenceInCalendarDays(now, v.scheduledFor!)}d]</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <Link href="/evc" className="btn btn-primary">View EVC Queue -&gt;</Link>
        </div>
      </div>
    );
  }

  if (user.role === "INSTITUTION") {
    const myApps = await prisma.application.findMany({
      where: { institutionId: user.institutionId! },
      include: { deadlineItems: { where: { state: "OPEN" }, orderBy: { dueAt: "asc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });
    const allUt = await prisma.undertaking.findMany({
      where: { institutionId: user.institutionId! },
      select: { status: true },
    });
    const allDocs = await prisma.instDocument.findMany({
      where: { institutionId: user.institutionId! },
      select: { status: true, validUntil: true },
    });
    const myUt = await prisma.undertaking.findMany({
      where: { institutionId: user.institutionId!, status: { in: ["PENDING", "OVERDUE"] } },
      orderBy: { dueDate: "asc" },
      take: 5,
    });
    const myDocs = await prisma.instDocument.findMany({
      where: { institutionId: user.institutionId!, status: { in: ["EXPIRING", "EXPIRED"] } },
      orderBy: { validUntil: "asc" },
      take: 5,
    });
    const latestMetrics = myApps.find((a) => a.metricsJson)?.metricsJson ?? null;
    const health = computeHealthScore({
      metricsJson: latestMetrics,
      docs: allDocs,
      undertakings: allUt,
      now,
    });
    const healthColor =
      health.label === "HEALTHY" ? "#16a34a" : health.label === "AT RISK" ? "#d97706" : "#dc2626";

    return (
      <div>
        {launchpad}
        <div className="page-header">
          <div>
            <h1 className="page-title">My Institution Dashboard</h1>
            <p className="page-subtitle">{user.institution?.name}</p>
          </div>
          <Link href="/applications/new" className="btn btn-primary">+ New Application</Link>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div className="card-title" style={{ marginBottom: 4 }}>Compliance Health Score</div>
              <p style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
                Year-round assistive score from latest APH metrics, document validity, and undertakings â€” not a statutory grade.
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: healthColor, fontFamily: "var(--font-mono)", lineHeight: 1 }}>
                {health.score}
              </div>
              <span className={`badge ${health.label === "HEALTHY" ? "badge-green" : health.label === "AT RISK" ? "badge-amber" : "badge-red"}`}>
                {health.label}
              </span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 16 }}>
            <div style={{ padding: "10px 12px", background: "#f8fafc", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>APH norms</div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{health.aphScore}/100</div>
            </div>
            <div style={{ padding: "10px 12px", background: "#f8fafc", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>Documents</div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{health.docsScore}/100</div>
            </div>
            <div style={{ padding: "10px 12px", background: "#f8fafc", borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: "#64748b" }}>Undertakings</div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{health.undertakingsScore}/100</div>
            </div>
          </div>
        </div>

        <div className="kpi-grid">
          <div className="kpi-card"><div className="kpi-label">My Applications</div><div className="kpi-value">{myApps.length}</div></div>
          <div className="kpi-card red"><div className="kpi-label">Pending Actions</div><div className="kpi-value" style={{ color: "#ef4444" }}>{myUt.length + myDocs.length}</div></div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><span className="card-title">My Applications</span><Link href="/applications" className="btn btn-secondary btn-sm">View All</Link></div>
          <table className="data-table">
            <thead><tr><th>Ref No</th><th>Type</th><th>Current Stage</th><th>Status</th></tr></thead>
            <tbody>
              {myApps.map((app) => (
                <tr key={app.id}>
                  <td><Link href={`/applications/${app.id}`} style={{ color: "#2a5298", fontWeight: 600 }}>{app.refNo}</Link></td>
                  <td>{app.applicationType.replace("_", " ")}</td>
                  <td>{app.currentStageKey.replace("_", " ")}</td>
                  <td><span className={`badge ${app.status === "RETURNED" ? "badge-amber" : app.status === "DECIDED" ? "badge-green" : "badge-blue"}`}>{app.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(myUt.length > 0 || myDocs.length > 0) && (
          <div className="card">
            <div className="card-title" style={{ marginBottom: 12 }}>Pending Actions Required</div>
            {myUt.map((ut) => (
              <div key={ut.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #f0f4f8" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, background: "var(--accent-blue)", padding: "2px 6px", borderRadius: 4 }}>[UT]</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{ut.title}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Undertaking â€¢ Due {ut.dueDate.toLocaleDateString()}</div>
                </div>
                <SlaChip days={differenceInCalendarDays(ut.dueDate, now)} />
              </div>
            ))}
            {myDocs.map((doc) => (
              <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #f0f4f8" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, background: "var(--highlighter-yellow)", padding: "2px 6px", borderRadius: 4 }}>[DOC]</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{doc.title}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>Document â€¢ Expires {doc.validUntil.toLocaleDateString()}</div>
                </div>
                <span className={`badge ${doc.status === "EXPIRED" ? "badge-red" : "badge-amber"}`}>{doc.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Admin dashboard
  const [openItems, alertsToday, recentTick] = await Promise.all([
    prisma.deadlineItem.count({ where: { state: "OPEN" } }),
    prisma.alertLog.count({ where: { firedAt: { gte: new Date(now.getTime() - 86400000) } } }),
    prisma.auditLog.findFirst({ where: { action: "TICK_RUN" }, orderBy: { seq: "desc" } }),
  ]);

  return (
    <div>
      {launchpad}
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-subtitle">System Administration â€¢ {user.name}</p>
        </div>
        <Link href="/admin" className="btn btn-primary">[ADMIN] Admin Panel</Link>
      </div>

      <div className="kpi-grid">
        <div className="kpi-card"><div className="kpi-label">Open Deadline Items</div><div className="kpi-value">{openItems}</div></div>
        <div className="kpi-card amber"><div className="kpi-label">Alerts Fired Today</div><div className="kpi-value" style={{ color: "#f59e0b" }}>{alertsToday}</div></div>
        <div className="kpi-card"><div className="kpi-label">Last Tick</div><div className="kpi-value" style={{ fontSize: 16 }}>{recentTick ? new Date(recentTick.ts).toLocaleTimeString() : "Never"}</div></div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>Quick Links</div>
          {[
            ["[RULES] Rules Editor", "/admin"],
            ["[CLOCK] Clock Control", "/admin#clock"],
            ["[AUDIT] Audit Trail", "/audit"],
            ["[REPORTS] Reports", "/reports"],
            ["[USERS] User Management", "/admin#users"],
          ].map(([label, href]) => (
            <Link key={href} href={href} className="nav-item" style={{ color: "#1e3a5f", padding: "8px 0", borderBottom: "1px solid #f0f4f8" }}>
              {label}
            </Link>
          ))}
        </div>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>System Status</div>
          <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Clock mode</span>
              <span className="badge badge-green">Real time</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Open deadlines</span>
              <span className="badge badge-blue">{openItems}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Alerts today</span>
              <span className="badge badge-amber">{alertsToday}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

