import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { getNow } from "@/lib/clock";
import Link from "next/link";

function SlaChip({ days, escalationLevel }: { days: number; escalationLevel?: number }) {
  if (escalationLevel && escalationLevel > 0) return <span className="sla-chip purple">[ESC:L{escalationLevel}]</span>;
  if (days < 0) return <span className="sla-chip red">[OVERDUE {Math.abs(days)}d]</span>;
  if (days <= 3) return <span className="sla-chip amber">[DUE {days}d]</span>;
  return <span className="sla-chip green">[OK {days}d]</span>;
}

export const dynamic = "force-dynamic";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const params = await searchParams;
  const now = await getNow();

  const where: Record<string, unknown> = {};
  if (user.role === "INSTITUTION") where.institutionId = user.institutionId;
  if (user.role === "REGIONAL_OFFICER") where.regionId = user.regionId;
  if (params.regionId) where.regionId = params.regionId;
  if (params.status) where.status = params.status;
  if (params.stage) where.currentStageKey = params.stage;
  if (params.search) {
    where.OR = [
      { refNo: { contains: params.search } },
      { institution: { name: { contains: params.search } } },
    ];
  }

  const applications = await prisma.application.findMany({
    where,
    include: {
      institution: { select: { name: true, type: true } },
      assignedTo: { select: { name: true } },
      deadlineItems: {
        where: { state: "OPEN", kind: "STAGE_TIMELINE" },
        orderBy: { dueAt: "asc" },
        take: 1,
      },
    },
    orderBy: { stageEnteredAt: "asc" },
    take: 100,
  });

  const regions = user.role === "BUREAU_OFFICER" || user.role === "ADMIN"
    ? await prisma.region.findMany({ orderBy: { name: "asc" } })
    : [];

  const stages = [
    "SCRUTINY", "RE_SCRUTINY", "EVC_QUEUE", "EVC_SCHEDULED", "EVC_REPORT", "SAC_SHC", "DECISION_PENDING",
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Applications</h1>
          <p className="page-subtitle">{applications.length} application(s) found</p>
        </div>
        {user.role === "INSTITUTION" && (
          <Link href="/applications/new" className="btn btn-primary">+ Submit Application</Link>
        )}
      </div>

      {/* Filter bar */}
      <form className="filter-bar" method="GET">
        <input name="search" className="form-input" placeholder="Search ref no / institution..." defaultValue={params.search} style={{ minWidth: 220 }} />
        {regions.length > 0 && (
          <select name="regionId" className="form-select" defaultValue={params.regionId}>
            <option value="">All Regions</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        )}
        <select name="stage" className="form-select" defaultValue={params.stage}>
          <option value="">All Stages</option>
          {stages.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <select name="status" className="form-select" defaultValue={params.status}>
          <option value="">All Status</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RETURNED">Returned</option>
          <option value="COMPLETED">Completed</option>
          <option value="DECIDED">Decided</option>
        </select>
        <button type="submit" className="btn btn-primary btn-sm">Filter</button>
        <a href="/applications" className="btn btn-secondary btn-sm">Clear</a>
      </form>

      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ref No</th>
                <th>Institution</th>
                <th>Type</th>
                <th>Route</th>
                <th>Current Stage</th>
                <th>Assigned To</th>
                <th>SLA</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {applications.map((app) => {
                const dl = app.deadlineItems[0];
                const days = dl ? differenceInCalendarDays(dl.dueAt, now) : 999;
                const esc = dl?.escalationLevel ?? 0;
                return (
                  <tr key={app.id}>
                    <td>
                      <Link href={`/applications/${app.id}`} style={{ color: "#2a5298", fontWeight: 700 }}>
                        {app.refNo}
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{app.institution.name}</div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>{app.institution.type}</div>
                    </td>
                    <td><span className="badge badge-blue">{app.applicationType.replace("_", " ")}</span></td>
                    <td><span style={{ fontSize: 11, color: "#64748b" }}>{app.route.replace("_", " ")}</span></td>
                    <td><span className="badge badge-gray">{app.currentStageKey.replace(/_/g, " ")}</span></td>
                    <td style={{ fontSize: 12, color: "#64748b" }}>{app.assignedTo?.name ?? "—"}</td>
                    <td><SlaChip days={days} escalationLevel={esc} /></td>
                    <td>
                      <span className={`badge ${
                        app.status === "RETURNED" ? "badge-amber" :
                        app.status === "DECIDED" ? "badge-green" :
                        app.status === "COMPLETED" ? "badge-green" : "badge-blue"
                      }`}>{app.status}</span>
                    </td>
                    <td>
                      <Link href={`/applications/${app.id}`} className="btn btn-secondary btn-sm">View</Link>
                    </td>
                  </tr>
                );
              })}
              {applications.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <h3>No Applications Found</h3>
                      <p>Try adjusting your filters or submit a new application.</p>
                    </div>
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
