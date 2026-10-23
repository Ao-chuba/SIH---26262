import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { getNow } from "@/lib/clock";
import Link from "next/link";
import { ActionPanel } from "../ActionPanel";
import { ROUTES, STAGES, APH_NORMS } from "@/config/rules";
import { parseMetrics, evaluateAph, aphScore, formatAphDeficiencies } from "@/lib/aph";
import { computeDualClock } from "@/lib/dualClock";

function SlaChip({ days, escalationLevel }: { days: number; escalationLevel?: number }) {
  if (escalationLevel && escalationLevel > 0) return <span className="sla-chip purple">[ESC:L{escalationLevel}]</span>;
  if (days < 0) return <span className="sla-chip red">[OVERDUE {Math.abs(days)}d]</span>;
  if (days <= 3) return <span className="sla-chip amber">[DUE {days}d]</span>;
  return <span className="sla-chip green">[OK {days}d]</span>;
}

function RouteStepper({
  route,
  current,
  status,
  assignedName,
  daysLeft,
}: {
  route: string;
  current: string;
  status: string;
  assignedName?: string;
  daysLeft?: number;
}) {
  const stages: readonly string[] = (ROUTES as Record<string, readonly string[]>)[route] ?? [];
  const mapKey = current === "RE_SCRUTINY" ? "SCRUTINY" : current;
  const currentIdx = stages.indexOf(mapKey);

  return (
    <div className="stage-tracker">
      {stages.map((stage, i) => {
        const isDone = i < currentIdx || (i === currentIdx && (status === "COMPLETED" || status === "DECIDED"));
        const isCurrent = i === currentIdx && status !== "COMPLETED" && status !== "DECIDED";
        const meta = STAGES[stage];
        const label =
          current === "RE_SCRUTINY" && stage === "SCRUTINY" && isCurrent
            ? "Re-Scrutiny"
            : (meta?.label ?? stage);
        return (
          <div key={stage} className="stage-step">
            <div className="stage-step-wrap">
              <div className={`stage-dot ${isDone ? "done" : isCurrent ? "current" : "future"}`}>
                {isDone ? "[x]" : i + 1}
              </div>
              <div className="stage-label" title={meta?.subtitle ?? label}>
                {label}
              </div>
              {meta?.subtitle && (
                <div style={{ fontSize: 10, color: "#94a3b8", maxWidth: 96, textAlign: "center", lineHeight: 1.25 }}>
                  {current === "RE_SCRUTINY" && stage === "SCRUTINY" && isCurrent
                    ? STAGES.RE_SCRUTINY?.subtitle
                    : meta.subtitle}
                </div>
              )}
              {isCurrent && assignedName && (
                <div style={{ fontSize: 10, color: "#1e40af", marginTop: 2, fontWeight: 600 }}>
                  {assignedName.split("–")[0].trim()}
                  {typeof daysLeft === "number" && daysLeft < 900 ? ` · ${daysLeft}d` : ""}
                </div>
              )}
            </div>
            {i < stages.length - 1 && <div className={`stage-line ${isDone ? "done" : ""}`} />}
          </div>
        );
      })}
    </div>
  );
}

function DualClockBar({ officerDays, institutionDays }: { officerDays: number; institutionDays: number }) {
  const total = Math.max(1, officerDays + institutionDays);
  const officerPct = Math.round((officerDays / total) * 100);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title" style={{ marginBottom: 8 }}>Dual-Clock Accountability</div>
      <p style={{ fontSize: 12, color: "#64748b", marginBottom: 12 }}>
        Who held the file: AICTE officer processing vs institution deficiency response time.
      </p>
      <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", background: "#e2e8f0" }}>
        <div style={{ width: `${officerPct}%`, background: "#2563eb", transition: "width 0.3s" }} title={`Officer ${officerDays}d`} />
        <div style={{ width: `${100 - officerPct}%`, background: "#f59e0b", transition: "width 0.3s" }} title={`Institution ${institutionDays}d`} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 13 }}>
        <span style={{ color: "#1e40af", fontWeight: 600 }}>🟦 AICTE Officer: {officerDays} days</span>
        <span style={{ color: "#b45309", fontWeight: 600 }}>🟧 Institution: {institutionDays} days</span>
      </div>
    </div>
  );
}

function AphNormsCard({ metricsJson }: { metricsJson: string | null }) {
  const metrics = parseMetrics(metricsJson);
  if (!metrics) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">APH Norms Compliance Check</div>
        <p style={{ fontSize: 13, color: "#64748b" }}>No metrics submitted for this application.</p>
      </div>
    );
  }
  const checks = evaluateAph(metrics);
  const passCount = checks.filter((c) => c.pass).length;
  const score = aphScore(metrics);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
        <div className="card-title" style={{ margin: 0 }}>APH Norms Compliance Check</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`badge ${score >= 75 ? "badge-green" : score >= 50 ? "badge-amber" : "badge-red"}`}>
            Score {score}/100
          </span>
          <span className={`badge ${passCount === checks.length ? "badge-green" : "badge-amber"}`}>
            {passCount}/{checks.length} pass
          </span>
        </div>
      </div>
      <p style={{ fontSize: 11, color: "#64748b", marginBottom: 12 }}>{APH_NORMS.label}</p>
      <div style={{ display: "grid", gap: 8 }}>
        {checks.map((c) => (
          <div
            key={c.key}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: "10px 12px",
              borderRadius: 8,
              background: c.pass ? "#ecfdf5" : "#fef2f2",
              border: `1px solid ${c.pass ? "#a7f3d0" : "#fecaca"}`,
            }}
          >
            <span style={{ fontSize: 13, fontFamily: "var(--font-mono)", fontWeight: 700 }}>
              {c.pass ? "[PASS]" : "[FAIL]"}
            </span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: c.pass ? "#065f46" : "#991b1b" }}>{c.label}</div>
              <div style={{ fontSize: 12, color: "#475569" }}>{c.detail}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                {c.clause}
              </div>
            </div>
          </div>
        ))}
      </div>
      {score < 100 && (
        <div style={{ marginTop: 12, padding: "10px 12px", background: "#fffbeb", border: "1px solid #fbbf24", borderRadius: 8, fontSize: 12, color: "#7c5c00" }}>
          Assistive tip: use <strong>[APH] Prefill Deficiencies</strong> in Actions to draft an observation from failed checks. Officers must still review and save — no auto-decision.
        </div>
      )}
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

  if (user.role === "INSTITUTION" && app.institutionId !== user.institutionId) notFound();
  if (user.role === "REGIONAL_OFFICER" && app.regionId !== user.regionId) notFound();

  const currentDeadline = app.deadlineItems.find((d) => d.state === "OPEN" && d.kind === "STAGE_TIMELINE");
  const days = currentDeadline ? differenceInCalendarDays(currentDeadline.dueAt, now) : 999;
  const dual = computeDualClock(app.stages, app.status, app.stageEnteredAt, now);
  const aphDeficiencyDraft = formatAphDeficiencies(parseMetrics(app.metricsJson));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Link href="/applications" style={{ color: "#64748b", fontSize: 13 }}>&lt;- Applications</Link>
        <div className="page-header" style={{ marginTop: 8, marginBottom: 0 }}>
          <div>
            <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {app.refNo}
              <SlaChip days={days} escalationLevel={currentDeadline?.escalationLevel ?? 0} />
              <span className={`badge ${app.status === "RETURNED" ? "badge-amber" : app.status === "DECIDED" ? "badge-green" : "badge-blue"}`}>{app.status}</span>
            </h1>
            <p className="page-subtitle">
              {app.institution.name} • {app.applicationType.replace(/_/g, " ")} •{" "}
              {app.applicationType === "EXTENSION" ? "EoA (annual license renewal)" : "APH workflow route"}
            </p>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>Application Route</div>
        <RouteStepper
          route={app.route}
          current={app.currentStageKey}
          status={app.status}
          assignedName={app.assignedTo?.name}
          daysLeft={days}
        />
        <div style={{ marginTop: 12, fontSize: 13, color: "#64748b", display: "flex", gap: 24, flexWrap: "wrap" }}>
          <span>
            Current Stage:{" "}
            <strong style={{ color: "#1e3a5f" }}>
              {STAGES[app.currentStageKey]?.label ?? app.currentStageKey}
            </strong>
            {STAGES[app.currentStageKey]?.subtitle && (
              <span style={{ color: "#94a3b8" }}> — {STAGES[app.currentStageKey].subtitle}</span>
            )}
          </span>
          <span>Assigned to: <strong>{app.assignedTo?.name ?? "Unassigned"}</strong></span>
          {currentDeadline && <span>Deadline: <strong>{new Date(currentDeadline.dueAt).toLocaleDateString()}</strong></span>}
        </div>
      </div>

      <DualClockBar officerDays={dual.officerDays} institutionDays={dual.institutionDays} />
      <AphNormsCard metricsJson={app.metricsJson} />

      <ActionPanel
        app={{ id: app.id, refNo: app.refNo, currentStageKey: app.currentStageKey, status: app.status, route: app.route }}
        user={{ role: user.role, id: user.id }}
        aphDeficiencyDraft={aphDeficiencyDraft}
      />

      <div className="grid-2" style={{ gap: 16 }}>
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>[TIMELINE] Stage Timeline</div>
          {app.stages.map((s) => (
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

        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>[NOTES] Observations</div>
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

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>[DEADLINES] All Deadlines</div>
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

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ marginBottom: 12 }}>[INSTITUTION] Institution Details</div>
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

      <div style={{ marginTop: 16 }}>
        <a href={`/api/applications/${app.id}/summary`} target="_blank" className="btn btn-secondary">
          [DOC] View Case Summary
        </a>
      </div>
    </div>
  );
}
