import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { getNow } from "@/lib/clock";
import Link from "next/link";

export default async function EvcPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["REGIONAL_OFFICER", "BUREAU_OFFICER", "EVC_COMMITTEE", "SAC_SHC_MEMBER", "ADMIN"].includes(user.role)) {
    redirect("/dashboard");
  }

  const now = await getNow();

  if (user.role === "SAC_SHC_MEMBER") redirect("/dashboard");

  const regionScope =
    user.role === "REGIONAL_OFFICER" ? { application: { regionId: user.regionId! } } : {};
  const canSchedule = user.role === "REGIONAL_OFFICER" || user.role === "ADMIN";

  const [queued, scheduled, completed] = await Promise.all([
    prisma.evcVisit.findMany({
      where: {
        status: "QUEUED",
        ...regionScope,
        // EVC members do not schedule — only see assigned/unassigned queue as read-only context
        ...(user.role === "EVC_COMMITTEE" ? { id: "__none__" } : {}),
      },
      include: { application: { include: { institution: { select: { name: true, type: true } } } } },
      orderBy: { queuedAt: "asc" },
    }),
    prisma.evcVisit.findMany({
      where: {
        status: "SCHEDULED",
        ...regionScope,
        ...(user.role === "EVC_COMMITTEE" ? { committeeId: user.id } : {}),
      },
      include: { application: { include: { institution: { select: { name: true, type: true } } } } },
      orderBy: { scheduledFor: "asc" },
    }),
    prisma.evcVisit.findMany({
      where: {
        status: "COMPLETED",
        ...regionScope,
        ...(user.role === "EVC_COMMITTEE" ? { committeeId: user.id } : {}),
      },
      include: { application: { include: { institution: { select: { name: true } } } } },
      orderBy: { completedAt: "desc" },
      take: 20,
    }),
  ]);

  const overdueCount = scheduled.filter((v) => v.scheduledFor && v.scheduledFor < now).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">EVC Inspections</h1>
          <p className="page-subtitle">Queue, scheduling, and inspection reports</p>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {user.role !== "EVC_COMMITTEE" && (
          <div className="kpi-card">
            <div className="kpi-label">Queue</div>
            <div className="kpi-value">{queued.length}</div>
            <div className="kpi-sub">Awaiting schedule (5d SLA)</div>
          </div>
        )}
        <div className="kpi-card amber">
          <div className="kpi-label">Scheduled</div>
          <div className="kpi-value" style={{ color: "var(--amber)" }}>{scheduled.length}</div>
          <div className="kpi-sub">Confirmed visits</div>
        </div>
        <div className="kpi-card red">
          <div className="kpi-label">Overdue</div>
          <div className="kpi-value" style={{ color: "var(--red)" }}>{overdueCount}</div>
          <div className="kpi-sub">Past scheduled date</div>
        </div>
        <div className="kpi-card green">
          <div className="kpi-label">Completed</div>
          <div className="kpi-value" style={{ color: "var(--green)" }}>{completed.length}</div>
          <div className="kpi-sub">Reports submitted</div>
        </div>
      </div>

      {/* EVC Queue — only shown to RO / Bureau / Admin */}
      {user.role !== "EVC_COMMITTEE" && (
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="card-header">
            <span className="card-title">Awaiting Scheduling</span>
            <span className="badge badge-blue">{queued.length}</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Institution</th>
                  <th>Discipline</th>
                  <th>Category</th>
                  <th>Queued On</th>
                  <th>Waiting</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {queued.map((v) => {
                  const daysWaiting = differenceInCalendarDays(now, v.queuedAt);
                  return (
                    <tr key={v.id}>
                      <td>
                        <Link href={`/applications/${v.applicationId}`} className="table-link font-mono">
                          {v.application.refNo}
                        </Link>
                      </td>
                      <td style={{ fontWeight: 700 }}>{v.application.institution.name}</td>
                      <td><span className="badge badge-blue">{v.application.institution.type}</span></td>
                      <td>
                        {v.isNewInstitution ? (
                          <span className="badge badge-red">New (30d SLA)</span>
                        ) : (
                          <span className="badge badge-gray">Existing</span>
                        )}
                      </td>
                      <td>{new Date(v.queuedAt).toLocaleDateString()}</td>
                      <td>
                        <span className={`sla-chip ${daysWaiting > 5 ? "red" : daysWaiting > 3 ? "amber" : "green"}`}>
                          {daysWaiting}d
                        </span>
                      </td>
                      <td>
                        {canSchedule ? (
                          <Link href={`/evc/${v.id}`} className="btn btn-primary btn-sm">
                            Schedule
                          </Link>
                        ) : (
                          <span className="badge badge-gray">RO schedules</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {queued.length === 0 && (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state"><p>No visits waiting in queue.</p></div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Scheduled Visits */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header">
          <span className="card-title">Scheduled Inspections</span>
          <span className="badge badge-amber">{scheduled.length}</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Application</th>
                <th>Institution</th>
                <th>Scheduled Date</th>
                <th>SLA</th>
                <th>Category</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {scheduled.map((v) => {
                const days = v.scheduledFor ? differenceInCalendarDays(v.scheduledFor, now) : 0;
                const isOverdue = days < 0;
                return (
                  <tr key={v.id}>
                    <td>
                      <Link href={`/applications/${v.applicationId}`} className="table-link font-mono">
                        {v.application.refNo}
                      </Link>
                    </td>
                    <td style={{ fontWeight: 700 }}>{v.application.institution.name}</td>
                    <td>{v.scheduledFor ? new Date(v.scheduledFor).toLocaleDateString() : "—"}</td>
                    <td>
                      <span className={`sla-chip ${isOverdue ? "red" : days <= 3 ? "amber" : "green"}`}>
                        {isOverdue ? `Overdue ${Math.abs(days)}d` : `Due ${days}d`}
                      </span>
                    </td>
                    <td>
                      {v.isNewInstitution ? <span className="badge badge-red">New</span> : <span className="badge badge-gray">Existing</span>}
                    </td>
                    <td>
                      {user.role === "EVC_COMMITTEE" || user.role === "ADMIN" ? (
                        <Link href={`/evc/${v.id}`} className="btn btn-primary btn-sm">
                          Submit Report
                        </Link>
                      ) : (
                        <Link href={`/evc/${v.id}`} className="btn btn-secondary btn-sm">
                          View Visit
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              {scheduled.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state"><p>No scheduled inspections.</p></div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Completed */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Completed Inspections</span>
          <span className="badge badge-green">{completed.length}</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Application</th>
                <th>Institution</th>
                <th>Completed On</th>
                <th>Report Ref</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {completed.map((v) => (
                <tr key={v.id}>
                  <td>
                    <Link href={`/applications/${v.applicationId}`} className="table-link font-mono">
                      {v.application.refNo}
                    </Link>
                  </td>
                  <td style={{ fontWeight: 700 }}>{v.application.institution.name}</td>
                  <td>{v.completedAt ? new Date(v.completedAt).toLocaleDateString() : "—"}</td>
                  <td><span className="badge badge-green">{v.reportRef ?? "—"}</span></td>
                  <td>
                    <Link href={`/applications/${v.applicationId}`} className="btn btn-secondary btn-sm">
                      View File
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
