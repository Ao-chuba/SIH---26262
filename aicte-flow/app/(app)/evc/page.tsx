import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { getNow } from "@/lib/clock";
import Link from "next/link";

export default async function EvcPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["REGIONAL_OFFICER", "BUREAU_OFFICER", "EVC_COMMITTEE", "ADMIN"].includes(user.role)) redirect("/dashboard");

  const now = await getNow();

  const [queued, scheduled, completed] = await Promise.all([
    prisma.evcVisit.findMany({
      where: { status: "QUEUED" },
      include: { application: { include: { institution: { select: { name: true, type: true } } } } },
      orderBy: { queuedAt: "asc" },
    }),
    prisma.evcVisit.findMany({
      where: { status: "SCHEDULED" },
      include: { application: { include: { institution: { select: { name: true, type: true } } } } },
      orderBy: { scheduledFor: "asc" },
    }),
    prisma.evcVisit.findMany({
      where: { status: "COMPLETED" },
      include: { application: { include: { institution: { select: { name: true } } } } },
      orderBy: { completedAt: "desc" },
      take: 20,
    }),
  ]);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">EVC Management</h1>
          <p className="page-subtitle">Expert Visit Committee Queue & Scheduling</p>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card"><div className="kpi-label">EVC Queue</div><div className="kpi-value">{queued.length}</div><div className="kpi-sub">Awaiting scheduling</div></div>
        <div className="kpi-card amber"><div className="kpi-label">Scheduled</div><div className="kpi-value" style={{ color: "#f59e0b" }}>{scheduled.length}</div><div className="kpi-sub">Visits confirmed</div></div>
        <div className="kpi-card green"><div className="kpi-label">Completed</div><div className="kpi-value" style={{ color: "#22c55e" }}>{completed.length}</div><div className="kpi-sub">Visits completed</div></div>
        <div className="kpi-card red"><div className="kpi-label">Overdue Visits</div><div className="kpi-value" style={{ color: "#ef4444" }}>{scheduled.filter((v) => v.scheduledFor && v.scheduledFor < now).length}</div></div>
      </div>

      {/* EVC Queue */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><span className="card-title">[QUEUE] EVC Queue (Awaiting Scheduling)</span></div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead><tr><th>Application</th><th>Institution</th><th>Type</th><th>New Inst?</th><th>Queued Since</th><th>Days Waiting</th><th>Action</th></tr></thead>
            <tbody>
              {queued.map((v) => {
                const daysWaiting = differenceInCalendarDays(now, v.queuedAt);
                return (
                  <tr key={v.id}>
                    <td><Link href={`/applications/${v.applicationId}`} style={{ color: "#2a5298", fontWeight: 600 }}>{v.application.institution.name}</Link></td>
                    <td>{v.application.institution.name}</td>
                    <td><span className="badge badge-blue">{v.application.institution.type}</span></td>
                    <td>{v.isNewInstitution ? <span className="badge badge-red">New</span> : <span className="badge badge-gray">Existing</span>}</td>
                    <td>{new Date(v.queuedAt).toLocaleDateString()}</td>
                    <td><span className={`sla-chip ${daysWaiting > 5 ? "red" : daysWaiting > 3 ? "amber" : "green"}`}>{daysWaiting}d</span></td>
                    <td><Link href={`/evc/${v.id}`} className="btn btn-primary btn-sm">Schedule</Link></td>
                  </tr>
                );
              })}
              {queued.length === 0 && <tr><td colSpan={7}><div className="empty-state"><p>No visits in queue.</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scheduled Visits */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><span className="card-title">[SCHEDULED] Scheduled Visits</span></div>
        <table className="data-table">
          <thead><tr><th>Application</th><th>Institution</th><th>Scheduled For</th><th>SLA</th><th>New Inst?</th><th>Status</th></tr></thead>
          <tbody>
            {scheduled.map((v) => {
              const days = v.scheduledFor ? differenceInCalendarDays(v.scheduledFor, now) : 0;
              const isOverdue = days < 0;
              return (
                <tr key={v.id}>
                  <td><Link href={`/applications/${v.applicationId}`} style={{ color: "#2a5298" }}>{v.application.institution.name}</Link></td>
                  <td>{v.application.institution.name}</td>
                  <td>{v.scheduledFor ? new Date(v.scheduledFor).toLocaleDateString() : "—"}</td>
                  <td><span className={`sla-chip ${isOverdue ? "red" : days <= 3 ? "amber" : "green"}`}>{isOverdue ? `[OVERDUE ${Math.abs(days)}d]` : `[DUE ${days}d]`}</span></td>
                  <td>{v.isNewInstitution ? <span className="badge badge-red">New</span> : <span className="badge badge-gray">Existing</span>}</td>
                  <td><span className="badge badge-amber">SCHEDULED</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Completed */}
      <div className="card">
        <div className="card-header"><span className="card-title">[COMPLETED] Completed Visits</span></div>
        <table className="data-table">
          <thead><tr><th>Institution</th><th>Completed</th><th>Report Ref</th></tr></thead>
          <tbody>
            {completed.map((v) => (
              <tr key={v.id}>
                <td><Link href={`/applications/${v.applicationId}`} style={{ color: "#2a5298" }}>{v.application.institution.name}</Link></td>
                <td>{v.completedAt ? new Date(v.completedAt).toLocaleDateString() : "—"}</td>
                <td><span className="badge badge-gray">{v.reportRef ?? "—"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
