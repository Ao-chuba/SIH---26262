import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { getNow } from "@/lib/clock";
import { computeHealthScore } from "@/lib/aph";
import { formatAppType, formatRoute, formatStage, formatStatus } from "@/lib/format";
import Link from "next/link";
import { QuickLinks } from "../QuickLinks";

function SlaChip({ days, escalationLevel }: { days: number; escalationLevel?: number }) {
  if (escalationLevel && escalationLevel > 0) {
    return <span className="sla-chip purple">Escalated L{escalationLevel}</span>;
  }
  if (days < 0) return <span className="sla-chip red">Overdue {Math.abs(days)}d</span>;
  if (days <= 3) return <span className="sla-chip amber">Due {days}d</span>;
  return <span className="sla-chip green">{days}d left</span>;
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const now = await getNow();

  if (user.role === "REGIONAL_OFFICER") {
    const [pending, myApps, evcCount, overdueUt, expiringDocs, escalated, regionInsts] = await Promise.all([
      prisma.application.count({ where: { regionId: user.regionId!, status: "IN_PROGRESS" } }),
      prisma.application.findMany({
        where: { regionId: user.regionId!, status: { in: ["IN_PROGRESS", "RETURNED"] } },
        include: {
          institution: { select: { name: true } },
          deadlineItems: { where: { state: "OPEN", kind: "STAGE_TIMELINE" }, orderBy: { dueAt: "asc" }, take: 1 },
        },
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
      const d = differenceInCalendarDays(dl.dueAt, now);
      return d >= 0 && d <= 3;
    }).length;

    const overdue = myApps.filter((a) => {
      const dl = a.deadlineItems[0];
      if (!dl) return false;
      return differenceInCalendarDays(dl.dueAt, now) < 0;
    }).length;

    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Regional Dashboard</h1>
            <p className="page-subtitle">{user.region?.name ?? "Regional"} Office · {user.name}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/evc" className="btn btn-secondary btn-sm">EVC Queue ({evcCount})</Link>
            <Link href="/applications" className="btn btn-primary btn-sm">All Applications &rarr;</Link>
          </div>
        </div>

      <div className="kpi-grid">
        <Link href="/applications?status=IN_PROGRESS" className="kpi-card" style={{ textDecoration: "none" }}>
          <div className="kpi-label">Active Files</div>
          <div className="kpi-value">{pending}</div>
          <div className="kpi-sub">In regional queue</div>
        </Link>
        <Link href="/applications" className="kpi-card amber" style={{ textDecoration: "none" }}>
          <div className="kpi-label">Due ≤3 Days</div>
          <div className="kpi-value" style={{ color: "var(--amber)" }}>{dueSoon}</div>
          <div className="kpi-sub">Approaching SLA</div>
        </Link>
        <Link href="/applications" className="kpi-card red" style={{ textDecoration: "none" }}>
          <div className="kpi-label">Overdue</div>
          <div className="kpi-value" style={{ color: "var(--red)" }}>{overdue}</div>
          <div className="kpi-sub">Past stage deadline</div>
        </Link>
        <Link href="/escalations" className="kpi-card purple" style={{ textDecoration: "none" }}>
          <div className="kpi-label">Escalated</div>
          <div className="kpi-value" style={{ color: "var(--purple)" }}>{escalated}</div>
          <div className="kpi-sub">Open L1–L3 items</div>
        </Link>
        <Link href="/evc" className="kpi-card" style={{ textDecoration: "none" }}>
          <div className="kpi-label">EVC Queue</div>
          <div className="kpi-value">{evcCount}</div>
          <div className="kpi-sub">Awaiting scheduling</div>
        </Link>
        <Link href="/undertakings" className="kpi-card red" style={{ textDecoration: "none" }}>
          <div className="kpi-label">Overdue Undertakings</div>
          <div className="kpi-value" style={{ color: "var(--red)" }}>{overdueUt}</div>
          <div className="kpi-sub">Pending verification</div>
        </Link>
        <Link href="/documents" className="kpi-card amber" style={{ textDecoration: "none" }}>
          <div className="kpi-label">Expiring Docs</div>
          <div className="kpi-value" style={{ color: "var(--amber)" }}>{expiringDocs}</div>
          <div className="kpi-sub">Within 90 days</div>
        </Link>
      </div>

        {regionHealth.length > 0 && (
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-header">
              <span className="card-title">Institution Compliance Index</span>
              <span className="badge badge-gray">0–100 Score</span>
            </div>
            <div className="grid-2" style={{ gap: 10 }}>
              {regionHealth.map((row) => (
                <div
                  key={row.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: 13, color: "var(--forest)" }}>{row.name}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span className="font-mono" style={{ fontWeight: 800, fontSize: 13 }}>{row.health.score}/100</span>
                    <span className={`badge ${row.health.label === "HEALTHY" ? "badge-green" : row.health.label === "AT RISK" ? "badge-amber" : "badge-red"}`}>
                      {row.health.label === "HEALTHY" ? "Healthy" : row.health.label === "AT RISK" ? "At Risk" : "Critical"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <span className="card-title">Regional Worklist</span>
            <Link href="/applications" className="btn btn-secondary btn-sm">View All &rarr;</Link>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ref No</th>
                  <th>Institution</th>
                  <th>Stage</th>
                  <th>SLA</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {myApps.map((app) => {
                  const dl = app.deadlineItems[0];
                  const days = dl ? differenceInCalendarDays(dl.dueAt, now) : 999;
                  const esc = dl?.escalationLevel ?? 0;
                  return (
                    <tr key={app.id}>
                      <td>
                        <Link href={`/applications/${app.id}`} className="table-link font-mono">
                          {app.refNo}
                        </Link>
                      </td>
                      <td style={{ fontWeight: 600 }}>{app.institution.name}</td>
                      <td><span className="badge badge-blue">{formatStage(app.currentStageKey)}</span></td>
                      <td><SlaChip days={days} escalationLevel={esc} /></td>
                      <td>
                        <span className={`badge ${app.status === "RETURNED" ? "badge-amber" : "badge-blue"}`}>
                          {formatStatus(app.status)}
                        </span>
                      </td>
                      <td>
                        <Link href={`/applications/${app.id}`} className="btn btn-primary btn-sm">
                          Review
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {myApps.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className="empty-state"><p>No applications assigned in this region.</p></div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (user.role === "BUREAU_OFFICER") {
    const [total, regions, appCountsByRegion, escalated, decidePending, pendingApps] = await Promise.all([
      prisma.application.count({ where: { status: "IN_PROGRESS" } }),
      prisma.region.findMany({
        include: {
          _count: { select: { institutions: true } },
        },
        orderBy: { name: "asc" },
      }),
      prisma.application.groupBy({
        by: ["regionId"],
        where: { status: "IN_PROGRESS" },
        _count: { id: true },
      }),
      prisma.deadlineItem.count({ where: { escalationLevel: { gte: 2 }, state: "OPEN" } }),
      prisma.application.count({ where: { currentStageKey: "DECISION_PENDING", status: "IN_PROGRESS" } }),
      prisma.application.findMany({
        where: { currentStageKey: "DECISION_PENDING", status: "IN_PROGRESS" },
        include: { institution: { select: { name: true, state: true } } },
        take: 10,
      }),
    ]);

    const appCountMap = Object.fromEntries(appCountsByRegion.map((g) => [g.regionId, g._count.id]));

    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Bureau Dashboard</h1>
            <p className="page-subtitle">All Regions · {user.name}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/escalations" className="btn btn-secondary btn-sm">Escalations ({escalated})</Link>
            <Link href="/applications?stage=DECISION_PENDING" className="btn btn-primary btn-sm">
              Decision Queue ({decidePending}) &rarr;
            </Link>
          </div>
        </div>

        <div className="kpi-grid">
          <Link href="/applications?status=IN_PROGRESS" className="kpi-card" style={{ textDecoration: "none" }}>
            <div className="kpi-label">Total In Progress</div>
            <div className="kpi-value">{total}</div>
            <div className="kpi-sub">Across 8 regions</div>
          </Link>
          <Link href="/escalations" className="kpi-card red" style={{ textDecoration: "none" }}>
            <div className="kpi-label">L2+ Escalations</div>
            <div className="kpi-value" style={{ color: "var(--red)" }}>{escalated}</div>
            <div className="kpi-sub">Bureau intervention</div>
          </Link>
          <Link href="/applications?stage=DECISION_PENDING" className="kpi-card amber" style={{ textDecoration: "none" }}>
            <div className="kpi-label">Decision Pending</div>
            <div className="kpi-value" style={{ color: "var(--amber)" }}>{decidePending}</div>
            <div className="kpi-sub">Competent authority</div>
          </Link>
        </div>

        {pendingApps.length > 0 && (
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="card-header">
              <span className="card-title">Awaiting Competent Authority Decision</span>
              <Link href="/applications?stage=DECISION_PENDING" className="btn btn-secondary btn-sm">View All</Link>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ref No</th>
                    <th>Institution</th>
                    <th>State</th>
                    <th>Type</th>
                    <th>Route</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApps.map((a) => (
                    <tr key={a.id}>
                      <td><Link href={`/applications/${a.id}`} className="table-link font-mono">{a.refNo}</Link></td>
                      <td style={{ fontWeight: 600 }}>{a.institution.name}</td>
                      <td>{a.institution.state}</td>
                      <td><span className="badge badge-blue">{formatAppType(a.applicationType)}</span></td>
                      <td><span className="badge badge-gray">{formatRoute(a.route)}</span></td>
                      <td>
                        <Link href={`/applications/${a.id}`} className="btn btn-primary btn-sm">
                          Record Decision
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="card">
          <div className="card-header"><span className="card-title">Region-wise Pendency</span></div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Headquarters</th>
                  <th>Institutions</th>
                  <th>In Progress</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {regions.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong></td>
                    <td style={{ color: "var(--forest-muted)" }}>{r.headquarters}</td>
                    <td>{r._count.institutions}</td>
                    <td><span className="badge badge-blue">{appCountMap[r.id] ?? 0} active</span></td>
                    <td>
                      <Link href={`/applications?regionId=${r.id}`} className="btn btn-secondary btn-sm">
                        View Region
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (user.role === "EVC_COMMITTEE") {
    const [scheduledVisits, completedVisits] = await Promise.all([
      prisma.evcVisit.findMany({
        where: { status: "SCHEDULED", committeeId: user.id },
        include: { application: { include: { institution: { select: { name: true, type: true } } } } },
        orderBy: { scheduledFor: "asc" },
      }),
      prisma.evcVisit.findMany({
        where: { status: "COMPLETED", committeeId: user.id },
        include: { application: { include: { institution: { select: { name: true } } } } },
        orderBy: { completedAt: "desc" },
        take: 10,
      }),
    ]);

    const overdueCount = scheduledVisits.filter((v) => v.scheduledFor && v.scheduledFor < now).length;

    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">EVC Committee Dashboard</h1>
            <p className="page-subtitle">{user.name} · Assigned Campus Inspections</p>
          </div>
          <Link href="/evc" className="btn btn-primary">All Inspections &rarr;</Link>
        </div>

        <div className="kpi-grid">
          <div className="kpi-card amber">
            <div className="kpi-label">Scheduled Visits</div>
            <div className="kpi-value" style={{ color: "var(--amber)" }}>{scheduledVisits.length}</div>
            <div className="kpi-sub">Assigned to you</div>
          </div>
          <div className="kpi-card red">
            <div className="kpi-label">Overdue Visits</div>
            <div className="kpi-value" style={{ color: "var(--red)" }}>{overdueCount}</div>
            <div className="kpi-sub">Past scheduled date</div>
          </div>
          <div className="kpi-card green">
            <div className="kpi-label">Completed Reports</div>
            <div className="kpi-value" style={{ color: "var(--green)" }}>{completedVisits.length}</div>
            <div className="kpi-sub">Submitted for RO review</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <span className="card-title">Assigned Scheduled Inspections</span>
            <Link href="/evc" className="btn btn-secondary btn-sm">Open EVC Workspace &rarr;</Link>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Application</th>
                <th>Institution</th>
                <th>Scheduled Date</th>
                <th>SLA</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {scheduledVisits.map((v) => {
                const days = v.scheduledFor ? differenceInCalendarDays(v.scheduledFor, now) : 0;
                return (
                  <tr key={v.id}>
                    <td>
                      <Link href={`/applications/${v.applicationId}`} className="table-link font-mono">
                        {v.application.refNo}
                      </Link>
                    </td>
                    <td style={{ fontWeight: 600 }}>{v.application.institution.name}</td>
                    <td>{v.scheduledFor?.toLocaleDateString() ?? "—"}</td>
                    <td><SlaChip days={days} /></td>
                    <td>
                      <Link href={`/evc/${v.id}`} className="btn btn-primary btn-sm">Submit Report</Link>
                    </td>
                  </tr>
                );
              })}
              {scheduledVisits.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <p>No scheduled visits currently assigned to your committee.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
            <div className="card-header">
              <span className="card-title">Recently Submitted Reports</span>
            </div>
            {completedVisits.length > 0 ? <table className="data-table">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Institution</th>
                  <th>Completed On</th>
                  <th>Report Ref</th>
                </tr>
              </thead>
              <tbody>
                {completedVisits.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Link href={`/applications/${v.applicationId}`} className="table-link font-mono">
                        {v.application.refNo}
                      </Link>
                    </td>
                    <td style={{ fontWeight: 600 }}>{v.application.institution.name}</td>
                    <td>{v.completedAt?.toLocaleDateString() ?? "—"}</td>
                    <td><span className="badge badge-green">{v.reportRef ?? "—"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table> : (
              <div className="empty-state"><p>No completed EVC reports yet.</p></div>
            )}
          </div>
      </div>
    );
  }

  if (user.role === "SAC_SHC_MEMBER") {
    const sacQueue = await prisma.application.findMany({
      where: { currentStageKey: "SAC_SHC", status: { in: ["IN_PROGRESS", "RETURNED"] } },
      include: {
        institution: { select: { name: true } },
        deadlineItems: { where: { state: "OPEN", kind: "STAGE_TIMELINE" }, orderBy: { dueAt: "asc" }, take: 1 },
      },
      orderBy: { stageEnteredAt: "asc" },
    });

    const overdueHearings = sacQueue.filter((a) => {
      const dl = a.deadlineItems[0];
      return dl ? differenceInCalendarDays(dl.dueAt, now) < 0 : false;
    }).length;

    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">SAC / SHC Hearing Dashboard</h1>
            <p className="page-subtitle">{user.name} · Standing Appellate &amp; Hearing Committee</p>
          </div>
          <Link href="/applications" className="btn btn-primary">Hearing Docket &rarr;</Link>
        </div>

        <div className="kpi-grid">
          <div className="kpi-card purple">
            <div className="kpi-label">Active Hearing Cases</div>
            <div className="kpi-value" style={{ color: "var(--purple)" }}>{sacQueue.length}</div>
            <div className="kpi-sub">Referred to SAC / SHC</div>
          </div>
          <div className="kpi-card red">
            <div className="kpi-label">Overdue Hearings</div>
            <div className="kpi-value" style={{ color: "var(--red)" }}>{overdueHearings}</div>
            <div className="kpi-sub">Past 10-day hearing SLA</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">SAC / SHC Hearing Queue</span>
            <span className="badge badge-purple">{sacQueue.length}</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ref No</th>
                <th>Institution</th>
                <th>Type</th>
                <th>SLA</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {sacQueue.map((a) => {
                const dl = a.deadlineItems[0];
                const days = dl ? differenceInCalendarDays(dl.dueAt, now) : 999;
                return (
                  <tr key={a.id}>
                    <td><Link href={`/applications/${a.id}`} className="table-link font-mono">{a.refNo}</Link></td>
                    <td style={{ fontWeight: 600 }}>{a.institution.name}</td>
                    <td><span className="badge badge-blue">{formatAppType(a.applicationType)}</span></td>
                    <td>{days < 900 ? <SlaChip days={days} escalationLevel={dl?.escalationLevel ?? 0} /> : "—"}</td>
                    <td><Link href={`/applications/${a.id}`} className="btn btn-primary btn-sm">Review &amp; Recommend</Link></td>
                  </tr>
                );
              })}
              {sacQueue.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <p>No applications currently awaiting SAC / SHC hearing.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
      health.label === "HEALTHY" ? "var(--green)" : health.label === "AT RISK" ? "var(--amber)" : "var(--red)";

    return (
      <div>
        <div className="page-header">
          <div>
            <h1 className="page-title">Institution Dashboard</h1>
            <p className="page-subtitle">{user.institution?.name ?? user.name}</p>
          </div>
          <Link href="/applications/new" className="btn btn-primary">+ New Application</Link>
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div className="card-title">Compliance Index</div>
              <p style={{ fontSize: 12.5, color: "var(--forest-muted)", marginTop: 2 }}>
                Weighted from APH norms, document validity, and open undertakings
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ fontSize: 34, fontWeight: 900, color: healthColor, fontFamily: "var(--font-mono)", lineHeight: 1 }}>
                {health.score}<span style={{ fontSize: 15, color: "var(--forest-muted)" }}>/100</span>
              </div>
              <span className={`badge ${health.label === "HEALTHY" ? "badge-green" : health.label === "AT RISK" ? "badge-amber" : "badge-red"}`}>
                {health.label === "HEALTHY" ? "Healthy" : health.label === "AT RISK" ? "At Risk" : "Critical"}
              </span>
            </div>
          </div>
          <div className="grid-3" style={{ marginTop: 14 }}>
            <div style={{ padding: "12px 14px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--forest-muted)", textTransform: "uppercase" }}>APH Norms</div>
              <div style={{ fontWeight: 800, fontSize: 19, marginTop: 4, fontFamily: "var(--font-mono)" }}>{health.aphScore}/100</div>
            </div>
            <div style={{ padding: "12px 14px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--forest-muted)", textTransform: "uppercase" }}>Documents</div>
              <div style={{ fontWeight: 800, fontSize: 19, marginTop: 4, fontFamily: "var(--font-mono)" }}>{health.docsScore}/100</div>
            </div>
            <div style={{ padding: "12px 14px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--forest-muted)", textTransform: "uppercase" }}>Undertakings</div>
              <div style={{ fontWeight: 800, fontSize: 19, marginTop: 4, fontFamily: "var(--font-mono)" }}>{health.undertakingsScore}/100</div>
            </div>
          </div>
        </div>

        <div className="kpi-grid">
          <Link href="/applications" className="kpi-card" style={{ textDecoration: "none" }}>
            <div className="kpi-label">Applications</div>
            <div className="kpi-value">{myApps.length}</div>
            <div className="kpi-sub">Submitted dockets</div>
          </Link>
          <Link href="/applications?status=RETURNED" className="kpi-card amber" style={{ textDecoration: "none" }}>
            <div className="kpi-label">Returned for Reply</div>
            <div className="kpi-value" style={{ color: "var(--amber)" }}>
              {myApps.filter((a) => a.status === "RETURNED").length}
            </div>
            <div className="kpi-sub">7-day response window</div>
          </Link>
          <Link href="/undertakings" className="kpi-card red" style={{ textDecoration: "none" }}>
            <div className="kpi-label">Pending Items</div>
            <div className="kpi-value" style={{ color: "var(--red)" }}>{myUt.length + myDocs.length}</div>
            <div className="kpi-sub">Undertakings &amp; expiring docs</div>
          </Link>
        </div>

        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <span className="card-title">Applications</span>
            <Link href="/applications" className="btn btn-secondary btn-sm">View All &rarr;</Link>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ref No</th>
                  <th>Type</th>
                  <th>Current Stage</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {myApps.map((app) => (
                  <tr key={app.id}>
                    <td>
                      <Link href={`/applications/${app.id}`} className="table-link font-mono">
                        {app.refNo}
                      </Link>
                    </td>
                    <td><span className="badge badge-blue">{formatAppType(app.applicationType)}</span></td>
                    <td><span className="badge badge-gray">{formatStage(app.currentStageKey)}</span></td>
                    <td>
                      <span className={`badge ${app.status === "RETURNED" ? "badge-amber" : app.status === "DECIDED" ? "badge-green" : "badge-blue"}`}>
                        {formatStatus(app.status)}
                      </span>
                    </td>
                    <td>
                      <Link href={`/applications/${app.id}`} className="btn btn-secondary btn-sm">
                        {app.status === "RETURNED" ? "Reply" : "Open"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {(myUt.length > 0 || myDocs.length > 0) && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Pending Compliance Items</span>
              <div style={{ display: "flex", gap: 8 }}>
                <Link href="/undertakings" className="btn btn-secondary btn-sm">Undertakings</Link>
                <Link href="/documents" className="btn btn-secondary btn-sm">Documents</Link>
              </div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {myUt.map((ut) => (
                <div
                  key={ut.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span className="badge badge-blue">Undertaking</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{ut.title}</div>
                    <div style={{ fontSize: 12, color: "var(--forest-muted)" }}>
                      Due {ut.dueDate.toLocaleDateString()}
                    </div>
                  </div>
                  <SlaChip days={differenceInCalendarDays(ut.dueDate, now)} />
                </div>
              ))}
              {myDocs.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 14px",
                    borderRadius: 12,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span className="badge badge-amber">Document</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{doc.title}</div>
                    <div style={{ fontSize: 12, color: "var(--forest-muted)" }}>
                      Expires {doc.validUntil.toLocaleDateString()}
                    </div>
                  </div>
                  <span className={`badge ${doc.status === "EXPIRED" ? "badge-red" : "badge-amber"}`}>{formatStatus(doc.status)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Admin dashboard
  const [openItems, alertsToday, recentTick, clockRecord, totalApps, escalatedCount] = await Promise.all([
    prisma.deadlineItem.count({ where: { state: "OPEN" } }),
    prisma.alertLog.count({ where: { firedAt: { gte: new Date(now.getTime() - 86400000) } } }),
    prisma.auditLog.findFirst({ where: { action: "TICK_RUN" }, orderBy: { seq: "desc" } }),
    prisma.systemClock.findUnique({ where: { id: 1 } }),
    prisma.application.count(),
    prisma.deadlineItem.count({ where: { state: "OPEN", escalationLevel: { gt: 0 } } }),
  ]);

  const isSimulating = !!clockRecord?.simulatedNow;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Dashboard</h1>
          <p className="page-subtitle">System Administration · {user.name}</p>
        </div>
        <Link href="/admin" className="btn btn-primary">Administration &rarr;</Link>
      </div>

      <QuickLinks userRole={user.role} regionId={user.regionId} institutionId={user.institutionId} />

      <div className="kpi-grid">
        <Link href="/applications" className="kpi-card" style={{ textDecoration: "none" }}>
          <div className="kpi-label">Open Deadlines</div>
          <div className="kpi-value">{openItems}</div>
          <div className="kpi-sub">Active SLA items</div>
        </Link>
        <Link href="/notifications?tab=delivery" className="kpi-card amber" style={{ textDecoration: "none" }}>
          <div className="kpi-label">Alerts (24h)</div>
          <div className="kpi-value" style={{ color: "var(--amber)" }}>{alertsToday}</div>
          <div className="kpi-sub">Reminders &amp; overdue</div>
        </Link>
        <Link href="/escalations" className="kpi-card purple" style={{ textDecoration: "none" }}>
          <div className="kpi-label">Escalations</div>
          <div className="kpi-value" style={{ color: "var(--purple)" }}>{escalatedCount}</div>
          <div className="kpi-sub">L1–L3 open</div>
        </Link>
        <Link href="/admin?tab=ticks" className="kpi-card green" style={{ textDecoration: "none" }}>
          <div className="kpi-label">Last Tick</div>
          <div className="kpi-value" style={{ fontSize: 22, marginTop: 10 }}>
            {recentTick ? new Date(recentTick.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Never"}
          </div>
          <div className="kpi-sub">{totalApps} total applications</div>
        </Link>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <span className="card-title">Quick Links</span>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {[
              ["System Calendar & Tick", "/admin", "Advance calendar date or run deadline engine"],
              ["SLA & APH Rules", "/admin?tab=rules", "Edit stage timelines and EVC limits"],
              ["Audit Ledger", "/audit", "Verify SHA-256 chain integrity"],
              ["Reports", "/reports", "Download CSV compliance summaries"],
              ["User Directory", "/admin?tab=users", "View regional and bureau escalation chain"],
            ].map(([label, href, sub]) => (
              <Link key={href} href={href} className="quick-link-row">
                <div>
                  <div style={{ fontWeight: 700, color: "var(--forest)" }}>{label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--forest-muted)", fontWeight: 500, marginTop: 1 }}>{sub}</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700 }}>&rarr;</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">System Status</span>
            <span className={`badge ${isSimulating ? "badge-amber" : "badge-green"}`}>
              {isSimulating ? "Override" : "Live"}
            </span>
          </div>
          <div style={{ display: "grid", gap: 10, fontSize: 13.5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--bg)", borderRadius: 12, border: "1px solid var(--border)" }}>
              <span style={{ fontWeight: 600, color: "var(--forest-muted)" }}>System Date</span>
              <span className="font-mono" style={{ fontWeight: 800 }}>
                {now.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--bg)", borderRadius: 12, border: "1px solid var(--border)" }}>
              <span style={{ fontWeight: 600, color: "var(--forest-muted)" }}>Open Deadlines</span>
              <span className="badge badge-blue">{openItems}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--bg)", borderRadius: 12, border: "1px solid var(--border)" }}>
              <span style={{ fontWeight: 600, color: "var(--forest-muted)" }}>Active Escalations</span>
              <span className="badge badge-purple">{escalatedCount}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--bg)", borderRadius: 12, border: "1px solid var(--border)" }}>
              <span style={{ fontWeight: 600, color: "var(--forest-muted)" }}>Alerts Fired Today</span>
              <span className="badge badge-amber">{alertsToday}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "var(--bg)", borderRadius: 12, border: "1px solid var(--border)" }}>
              <span style={{ fontWeight: 600, color: "var(--forest-muted)" }}>Audit Chain</span>
              <Link href="/audit" className="badge badge-green" style={{ textDecoration: "none" }}>
                SHA-256 Verified &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
