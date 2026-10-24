import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { getNow } from "@/lib/clock";
import { STAGES } from "@/config/rules";
import { formatAppType, formatRoute, formatStage, formatStatus } from "@/lib/format";
import Link from "next/link";

function SlaChip({ days, escalationLevel }: { days: number; escalationLevel?: number }) {
  if (escalationLevel && escalationLevel > 0) return <span className="sla-chip purple">Escalated L{escalationLevel}</span>;
  if (days < 0) return <span className="sla-chip red">Overdue {Math.abs(days)}d</span>;
  if (days <= 3) return <span className="sla-chip amber">Due {days}d</span>;
  return <span className="sla-chip green">{days}d left</span>;
}

const ROUTE_LABELS: Record<string, string> = {
  ONLY_SCRUTINY: "Scrutiny Only",
  SCRUTINY_EVC: "Scrutiny + EVC",
  EVC_SAC_SHC: "EVC + SAC/SHC",
  ONLY_EVC: "Direct EVC",
  SCRUTINY_EVC_SAC_SHC: "Scrutiny + EVC + SAC/SHC",
};

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

  const scope: Record<string, unknown> = {};
  if (user.role === "INSTITUTION") scope.institutionId = user.institutionId;
  if (user.role === "REGIONAL_OFFICER") scope.regionId = user.regionId;
  else if ((user.role === "BUREAU_OFFICER" || user.role === "ADMIN") && params.regionId) {
    scope.regionId = params.regionId;
  }
  if (user.role === "EVC_COMMITTEE") {
    scope.OR = [
      { evcVisit: { committeeId: user.id } },
      {
        currentStageKey: { in: ["EVC_QUEUE", "EVC_SCHEDULED", "EVC_REPORT"] },
        evcVisit: { committeeId: null },
      },
    ];
  }
  if (user.role === "SAC_SHC_MEMBER") scope.currentStageKey = "SAC_SHC";

  const filters: Record<string, unknown>[] = [scope];
  if (params.status) filters.push({ status: params.status });
  if (params.stage && user.role !== "SAC_SHC_MEMBER") filters.push({ currentStageKey: params.stage });
  if (params.search) {
    filters.push({
      OR: [
        { refNo: { contains: params.search } },
        { institution: { name: { contains: params.search } } },
      ],
    });
  }
  const where = filters.length === 1 ? scope : { AND: filters };

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

  const regions =
    user.role === "BUREAU_OFFICER" || user.role === "ADMIN"
      ? await prisma.region.findMany({ orderBy: { name: "asc" } })
      : [];

  const stages = [
    "SCRUTINY",
    "RE_SCRUTINY",
    "EVC_QUEUE",
    "EVC_SCHEDULED",
    "EVC_REPORT",
    "SAC_SHC",
    "DECISION_PENDING",
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Applications</h1>
          <p className="page-subtitle">{applications.length} application(s)</p>
        </div>
        {user.role === "INSTITUTION" && (
          <Link href="/applications/new" className="btn btn-primary">
            + New Application
          </Link>
        )}
      </div>

      {/* Filter bar */}
      <form className="filter-bar" method="GET">
        <input
          name="search"
          className="form-input"
          placeholder="Search ref no or institution..."
          defaultValue={params.search}
          style={{ minWidth: 240, flex: 1 }}
        />
        {regions.length > 0 && (
          <select name="regionId" className="form-select" defaultValue={params.regionId}>
            <option value="">All Regions</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
        <select name="stage" className="form-select" defaultValue={params.stage}>
          <option value="">All Stages</option>
          {stages.map((s) => (
            <option key={s} value={s}>
              {STAGES[s]?.label ?? s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <select name="status" className="form-select" defaultValue={params.status}>
          <option value="">All Status</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RETURNED">Returned</option>
          <option value="COMPLETED">Completed</option>
          <option value="DECIDED">Decided</option>
        </select>
        <button type="submit" className="btn btn-primary btn-sm">
          Filter
        </button>
        <Link href="/applications" className="btn btn-secondary btn-sm">
          Reset
        </Link>
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
                <th>Stage</th>
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
                const stageMeta = STAGES[app.currentStageKey];
                return (
                  <tr key={app.id}>
                    <td>
                      <Link href={`/applications/${app.id}`} className="table-link font-mono">
                        {app.refNo}
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: "var(--forest)" }}>{app.institution.name}</div>
                      <div style={{ fontSize: 11.5, color: "var(--forest-muted)" }}>{app.institution.type}</div>
                    </td>
                    <td>
                      <span className="badge badge-blue">{formatAppType(app.applicationType)}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--forest-muted)" }}>
                        {formatRoute(app.route)}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-gray">{stageMeta?.label ?? formatStage(app.currentStageKey)}</span>
                    </td>
                    <td style={{ fontSize: 12.5, color: "var(--forest-muted)", fontWeight: 500 }}>
                      {app.assignedTo?.name ?? "Unassigned"}
                    </td>
                    <td>
                      {days < 900 ? <SlaChip days={days} escalationLevel={esc} /> : <span style={{ color: "var(--forest-light)" }}>—</span>}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          app.status === "RETURNED"
                            ? "badge-amber"
                            : app.status === "DECIDED" || app.status === "COMPLETED"
                              ? "badge-green"
                              : "badge-blue"
                        }`}
                      >
                        {formatStatus(app.status)}
                      </span>
                    </td>
                    <td>
                      <Link href={`/applications/${app.id}`} className="btn btn-secondary btn-sm">
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {applications.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-state">
                      <h3>No Applications Found</h3>
                      <p>Adjust filters or submit a new application.</p>
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
