import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { getNow } from "@/lib/clock";
import Link from "next/link";
import { ActionPanel } from "../ActionPanel";
import { ROUTES, STAGES } from "@/config/rules";

function SlaChip({ days, escalationLevel }: { days: number; escalationLevel?: number }) {
  if (escalationLevel && escalationLevel > 0) return <span className="sla-chip purple">🔺 ESC-L{escalationLevel}</span>;
  if (days < 0) return <span className="sla-chip red">🔴 {Math.abs(days)}d overdue</span>;
  if (days <= 3) return <span className="sla-chip amber">🟡 {days}d left</span>;
  return <span className="sla-chip green">🟢 {days}d left</span>;
}

function RouteStepper({ route, current, status }: { route: string; current: string; status: string }) {
  const stages: readonly string[] = (ROUTES as Record<string, readonly string[]>)[route] ?? [];
  const currentIdx = stages.indexOf(current);

  return (
    <div className="stage-tracker">
      {stages.map((stage, i) => {
        const isDone = i < currentIdx || (i === currentIdx && (status === "COMPLETED" || status === "DECIDED"));
        const isCurrent = i === currentIdx && status !== "COMPLETED" && status !== "DECIDED";
        return (
          <div key={stage} className="stage-step">
            <div className="stage-step-wrap">
              <div className={`stage-dot ${isDone ? "done" : isCurrent ? "current" : "future"}`}>
                {isDone ? "✓" : i + 1}
              </div>
              <div className="stage-label" title={STAGES[stage]?.label ?? stage}>
                {STAGES[stage]?.label ?? stage}
              </div>
            </div>
            {i < stages.length - 1 && <div className={`stage-line ${isDone ? "done" : ""}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const now = await getNow();

  const app = await prisma.application.findUnique({
    where: { id },
    include: {
      institution: true,
      assignedTo: { select: { name: true, email: true, role: true } },
      stages: { orderBy: { enteredAt: "asc" }, include: { enteredBy: { select: { name: true } } } },
      observations: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, role: true } } } },
      deadlineItems: { orderBy: { openedAt: "desc" }, include: { escalationEvents: { include: { escalatedTo: { select: { name: true, role: true } } } } } },
      undertakings: true,
      evcVisit: true,
    },
  });

  if (!app) notFound();

  // Scope check
  if (user.role === "INSTITUTION" && app.institutionId !== user.institutionId) notFound();
  if (user.role === "REGIONAL_OFFICER" && app.regionId !== user.regionId) notFound();

  const currentDeadline = app.deadlineItems.find((d) => d.state === "OPEN" && d.kind === "STAGE_TIMELINE");
  const days = currentDeadline ? differenceInCalendarDays(currentDeadline.dueAt, now) : 999;

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <Link href="/applications" style={{ color: "#64748b", fontSize: 13 }}>← Applications</Link>
        <div className="page-header" style={{ marginTop: 8, marginBottom: 0 }}>
          <div>
            <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {app.refNo}
              <SlaChip days={days} escalationLevel={currentDeadline?.escalationLevel ?? 0} />
              <span className={`badge ${app.status === "RETURNED" ? "badge-amber" : app.status === "DECIDED" ? "badge-green" : "badge-blue"}`}>{app.status}</span>
            </h1>
            <p className="page-subtitle">{app.institution.name} • {app.applicationType.replace("_", " ")} • Route: {app.route.replace("_", " ")}</p>
          </div>
        </div>
      </div>

      {/* Route stepper */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>Application Route</div>
        <RouteStepper route={app.route} current={app.currentStageKey} status={app.status} />
        <div style={{ marginTop: 12, fontSize: 13, color: "#64748b", display: "flex", gap: 24 }}>
          <span>Current Stage: <strong style={{ color: "#1e3a5f" }}>{STAGES[app.currentStageKey]?.label ?? app.currentStageKey}</strong></span>
          <span>Assigned to: <strong>{app.assignedTo?.name ?? "Unassigned"}</strong></span>
          {currentDeadline && <span>Deadline: <strong>{new Date(currentDeadline.dueAt).toLocaleDateString()}</strong></span>}
        </div>
      </div>

      {/* Action Panel */}
      <ActionPanel app={{ id: app.id, refNo: app.refNo, currentStageKey: app.currentStageKey, status: app.status, route: app.route }} user={{ role: user.role, id: user.id }} />

      {/* Tabs (simplified as sections) */}
      <div className="grid-2" style={{ gap: 16 }}>
        {/* Timeline */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>📅 Stage Timeline</div>
          {app.stages.map((s, i) => (
            <div key={s.id} style={{ display: "flex", gap: 12, padding: "8px 0", borderBottom: "1px solid #f0f4f8" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.exitedAt ? "#22c55e" : "#2a5298", flexShrink: 0, marginTop: 6 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{STAGES[s.stageKey]?.label ?? s.stageKey}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>
                  Entered: {new Date(s.enteredAt).toLocaleDateString()}
                  {s.exitedAt && ` • Exited: ${new Date(s.exitedAt).toLocaleDateString()}`}
                  {s.exitedAt && ` • ${differenceInCalendarDays(s.exitedAt, s.enteredAt)}d`}
                </div>
                {s.outcome && <span className={`badge ${s.outcome === "ADVANCED" ? "badge-green" : s.outcome === "RETURNED" ? "badge-amber" : "badge-gray"}`} style={{ marginTop: 2 }}>{s.outcome}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Observations */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>💬 Observations</div>
          {app.observations.length === 0 && <p style={{ fontSize: 13, color: "#64748b" }}>No observations yet.</p>}
          {app.observations.map((obs) => (
            <div key={obs.id} style={{ padding: "10px 0", borderBottom: "1px solid #f0f4f8" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span className={`badge ${obs.kind === "DEFICIENCY" ? "badge-red" : obs.kind === "REPLY" ? "badge-green" : "badge-blue"}`}>{obs.kind}</span>
                <span style={{ fontSize: 11, color: "#64748b" }}>{obs.author.name} • {new Date(obs.createdAt).toLocaleDateString()}</span>
              </div>
              <p style={{ fontSize: 13, color: "#374151" }}>{obs.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Deadlines */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>⏰ All Deadlines</div>
        <table className="data-table">
          <thead><tr><th>Kind</th><th>Title</th><th>Due</th><th>State</th><th>Escalation</th></tr></thead>
          <tbody>
            {app.deadlineItems.map((dl) => (
              <tr key={dl.id}>
                <td><span className="badge badge-blue">{dl.kind.replace("_", " ")}</span></td>
                <td>{dl.title}</td>
                <td>{new Date(dl.dueAt).toLocaleDateString()}</td>
                <td><span className={`badge ${dl.state === "OPEN" ? "badge-blue" : dl.state === "SATISFIED" ? "badge-green" : "badge-gray"}`}>{dl.state}</span></td>
                <td>{dl.escalationLevel > 0 ? <span className="sla-chip purple">L{dl.escalationLevel}</span> : "—"}</td>
              </tr>
            ))}
            {app.deadlineItems.length === 0 && <tr><td colSpan={5}><span style={{ color: "#64748b", fontSize: 13 }}>No deadlines.</span></td></tr>}
          </tbody>
        </table>
      </div>

      {/* Institution info */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>🏫 Institution Details</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, fontSize: 13 }}>
          {[
            ["AICTE ID", app.institution.aicteId],
            ["Name", app.institution.name],
            ["Type", app.institution.type],
            ["State", app.institution.state],
            ["Contact", app.institution.contactEmail],
            ["Phone", app.institution.contactPhone],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontWeight: 600, fontSize: 11, color: "#64748b", textTransform: "uppercase", marginBottom: 2 }}>{k}</div>
              <div>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Case Summary link */}
      <div style={{ marginTop: 16 }}>
        <a href={`/api/applications/${app.id}/summary`} target="_blank" className="btn btn-secondary">
          📄 View Case Summary
        </a>
      </div>
    </div>
  );
}
