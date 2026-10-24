import { canViewApplication, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { getNow } from "@/lib/clock";
import Link from "next/link";
import { ActionPanel } from "../ActionPanel";
import { ROUTES, STAGES } from "@/config/rules";
import { parseMetrics, evaluateAph, aphScore, formatAphDeficiencies } from "@/lib/aph";
import { computeDualClock } from "@/lib/dualClock";
import { formatAppType, formatDeadlineKind, formatDocType, formatOutcome, formatRoute, formatStatus } from "@/lib/format";

function SlaChip({ days, escalationLevel }: { days: number; escalationLevel?: number }) {
  if (escalationLevel && escalationLevel > 0) return <span className="sla-chip purple">Escalated L{escalationLevel}</span>;
  if (days < 0) return <span className="sla-chip red">Overdue {Math.abs(days)}d</span>;
  if (days <= 3) return <span className="sla-chip amber">Due {days}d</span>;
  return <span className="sla-chip green">{days}d left</span>;
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
                {isDone ? "✓" : i + 1}
              </div>
              <div className="stage-label" title={meta?.subtitle ?? label}>
                {label}
              </div>
              {meta?.subtitle && (
                <div style={{ fontSize: 10.5, color: "var(--forest-muted)", maxWidth: 108, textAlign: "center", lineHeight: 1.3, marginTop: 2 }}>
                  {current === "RE_SCRUTINY" && stage === "SCRUTINY" && isCurrent
                    ? STAGES.RE_SCRUTINY?.subtitle
                    : meta.subtitle}
                </div>
              )}
              {isCurrent && assignedName && (
                <div
                  style={{
                    fontSize: 10.5,
                    color: "var(--forest)",
                    background: "var(--highlighter-yellow-soft)",
                    border: "1px solid var(--border)",
                    padding: "1px 6px",
                    borderRadius: 9999,
                    marginTop: 4,
                    fontWeight: 700,
                  }}
                >
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
      <div className="card-header" style={{ marginBottom: 8 }}>
        <span className="card-title">Processing Time Split (Dual-Clock)</span>
        <span className="badge badge-gray">Total {officerDays + institutionDays}d</span>
      </div>
      <div style={{ display: "flex", height: 16, borderRadius: 9999, overflow: "hidden", background: "var(--bg-subtle)", border: "1px solid var(--border)" }}>
        <div
          style={{ width: `${officerPct}%`, background: "var(--forest)", transition: "width 0.3s" }}
          title={`AICTE Officer ${officerDays}d`}
        />
        <div
          style={{ width: `${100 - officerPct}%`, background: "#D97706", transition: "width 0.3s" }}
          title={`Institution ${institutionDays}d`}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12.5 }}>
        <span style={{ color: "var(--forest)", fontWeight: 700 }}>
          AICTE Officer Review: {officerDays}d ({officerPct}%)
        </span>
        <span style={{ color: "var(--amber)", fontWeight: 700 }}>
          Institution Deficiency Response: {institutionDays}d ({100 - officerPct}%)
        </span>
      </div>
    </div>
  );
}

function AphNormsCard({ metricsJson }: { metricsJson: string | null }) {
  const metrics = parseMetrics(metricsJson);
  if (!metrics) {
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">APH Norms Check</div>
        <p style={{ fontSize: 13, color: "var(--forest-muted)", marginTop: 4 }}>
          No metrics recorded for this application.
        </p>
      </div>
    );
  }
  const checks = evaluateAph(metrics);
  const passCount = checks.filter((c) => c.pass).length;
  const score = aphScore(metrics);
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 12, flexWrap: "wrap" }}>
        <div className="card-title">APH Norms Check</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className={`badge ${score >= 75 ? "badge-green" : score >= 50 ? "badge-amber" : "badge-red"}`}>
            {score}/100
          </span>
          <span className={`badge ${passCount === checks.length ? "badge-green" : "badge-amber"}`}>
            {passCount}/{checks.length} Passed
          </span>
        </div>
      </div>

      <div className="grid-2" style={{ gap: 10 }}>
        {checks.map((c) => (
          <div
            key={c.key}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              padding: "11px 14px",
              borderRadius: 12,
              background: c.pass ? "var(--green-bg)" : "var(--red-bg)",
              border: `1.5px solid ${c.pass ? "var(--green-border)" : "var(--red-border)"}`,
            }}
          >
            <span
              className="font-mono"
              style={{
                fontSize: 11,
                fontWeight: 800,
                color: c.pass ? "var(--green)" : "var(--red)",
                flexShrink: 0,
                marginTop: 2,
              }}
            >
              {c.pass ? "PASS" : "FAIL"}
            </span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13, color: c.pass ? "var(--green)" : "var(--red)" }}>
                {c.label}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--forest)", marginTop: 2 }}>{c.detail}</div>
              <div style={{ fontSize: 11, color: "var(--forest-muted)", marginTop: 3, fontFamily: "var(--font-mono)" }}>
                {c.clause}
              </div>
            </div>
          </div>
        ))}
      </div>
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
      institution: {
        include: {
          documents: { orderBy: { validUntil: "asc" }, take: 5 },
        },
      },
      assignedTo: { select: { name: true, email: true, role: true } },
      decidedBy: { select: { name: true, role: true } },
      stages: { orderBy: { enteredAt: "asc" }, include: { enteredBy: { select: { name: true } } } },
      observations: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, role: true } } } },
      deadlineItems: {
        orderBy: { openedAt: "desc" },
        include: { escalationEvents: { include: { escalatedTo: { select: { name: true, role: true } } } } },
      },
      undertakings: true,
      evcVisit: true,
    },
  });

  if (!app) notFound();
  if (!canViewApplication(user, app, app.evcVisit?.committeeId)) notFound();

  const currentDeadline =
    app.deadlineItems.find((d) => d.state === "OPEN" && d.kind === "STAGE_TIMELINE") ??
    app.deadlineItems.find((d) => d.state === "OPEN");
  const days = currentDeadline ? differenceInCalendarDays(currentDeadline.dueAt, now) : 999;
  const dual = computeDualClock(app.stages, app.status, app.stageEnteredAt, now);
  const aphDeficiencyDraft = formatAphDeficiencies(parseMetrics(app.metricsJson));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <Link href="/applications" className="btn btn-secondary btn-sm" style={{ marginBottom: 12 }}>
          &larr; Applications
        </Link>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div>
            <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span className="font-mono">{app.refNo}</span>
              {days < 900 && <SlaChip days={days} escalationLevel={currentDeadline?.escalationLevel ?? 0} />}
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
            </h1>
            <p className="page-subtitle">
              {app.institution.name} · {formatAppType(app.applicationType)}
            </p>
          </div>
          <a href={`/api/applications/${app.id}/summary`} target="_blank" className="btn btn-secondary btn-sm">
            Printable Summary &rarr;
          </a>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ marginBottom: 12 }}>
          <span className="card-title">Workflow Route</span>
          <span className="badge badge-blue">{formatRoute(app.route)}</span>
        </div>
        <RouteStepper
          route={app.route}
          current={app.currentStageKey}
          status={app.status}
          assignedName={app.assignedTo?.name}
          daysLeft={days}
        />
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
            fontSize: 13,
            color: "var(--forest-muted)",
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <span>
            Stage:{" "}
            <strong style={{ color: "var(--forest)" }}>
              {STAGES[app.currentStageKey]?.label ?? app.currentStageKey}
            </strong>
          </span>
          <span>
            Assigned To: <strong style={{ color: "var(--forest)" }}>{app.assignedTo?.name ?? "Unassigned"}</strong>
          </span>
          {currentDeadline && (
            <span>
              Due Date:{" "}
              <strong style={{ color: "var(--forest)" }}>
                {new Date(currentDeadline.dueAt).toLocaleDateString()}
              </strong>
            </span>
          )}
        </div>
      </div>

      <DualClockBar officerDays={dual.officerDays} institutionDays={dual.institutionDays} />

      {app.decision && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header" style={{ marginBottom: 8 }}>
            <span className="card-title">Competent Authority Decision</span>
            <span
              className={`badge ${
                app.decision === "REJECTED"
                  ? "badge-red"
                  : app.decision === "APPROVED_WITH_CONDITIONS"
                    ? "badge-amber"
                    : "badge-green"
              }`}
            >
              {formatStatus(app.decision)}
            </span>
          </div>
          <p style={{ fontSize: 13.5, color: "var(--forest)", marginBottom: 8, whiteSpace: "pre-wrap" }}>
            {app.decisionRemarks ?? "—"}
          </p>
          <div style={{ fontSize: 12.5, color: "var(--forest-muted)" }}>
            Recorded by <strong style={{ color: "var(--forest)" }}>{app.decidedBy?.name ?? "Bureau"}</strong>
            {app.decidedAt && (
              <>
                {" "}
                on{" "}
                <strong style={{ color: "var(--forest)" }}>
                  {new Date(app.decidedAt).toLocaleString("en-IN")}
                </strong>
              </>
            )}
          </div>
        </div>
      )}

      <AphNormsCard metricsJson={app.metricsJson} />

      <ActionPanel
        app={{
          id: app.id,
          refNo: app.refNo,
          currentStageKey: app.currentStageKey,
          status: app.status,
          route: app.route,
        }}
        user={{ role: user.role, id: user.id }}
        aphDeficiencyDraft={aphDeficiencyDraft}
        evcVisitId={app.evcVisit?.id ?? null}
      />

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Stage History</span>
            <span className="badge badge-gray">{app.stages.length}</span>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {app.stages.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: s.exitedAt ? "var(--green)" : "var(--forest)",
                    flexShrink: 0,
                    marginTop: 5,
                  }}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--forest)" }}>
                      {STAGES[s.stageKey]?.label ?? s.stageKey}
                    </span>
                    {s.outcome && (
                      <span
                        className={`badge ${
                          s.outcome === "ADVANCED"
                            ? "badge-green"
                            : s.outcome === "RETURNED"
                              ? "badge-amber"
                              : "badge-purple"
                        }`}
                      >
                        {formatOutcome(s.outcome)}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--forest-muted)", marginTop: 2 }}>
                    Entered: {new Date(s.enteredAt).toLocaleDateString()}
                    {s.exitedAt && ` · Exited: ${new Date(s.exitedAt).toLocaleDateString()}`}
                    {s.exitedAt && ` (${Math.max(1, differenceInCalendarDays(s.exitedAt, s.enteredAt))}d)`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Observations &amp; Replies</span>
            <span className="badge badge-gray">{app.observations.length}</span>
          </div>
          {app.observations.length === 0 && (
            <div className="empty-state" style={{ padding: "24px 12px" }}>
              <p>No observations recorded.</p>
            </div>
          )}
          <div style={{ display: "grid", gap: 10 }}>
            {app.observations.map((obs) => (
              <div
                key={obs.id}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                  <span
                    className={`badge ${
                      obs.kind === "DEFICIENCY"
                        ? "badge-red"
                        : obs.kind === "REPLY"
                          ? "badge-green"
                          : "badge-blue"
                    }`}
                  >
                    {formatStatus(obs.kind)}
                  </span>
                  <span style={{ fontSize: 11.5, color: "var(--forest-muted)", fontWeight: 600 }}>
                    {obs.author.name} · {new Date(obs.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p style={{ fontSize: 13, color: "var(--forest)", whiteSpace: "pre-wrap" }}>{obs.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <span className="card-title">Deadlines</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>Title</th>
                <th>Due Date</th>
                <th>State</th>
                <th>Escalation</th>
              </tr>
            </thead>
            <tbody>
              {app.deadlineItems.map((dl) => (
                <tr key={dl.id}>
                  <td><span className="badge badge-blue">{formatDeadlineKind(dl.kind)}</span></td>
                  <td style={{ fontWeight: 600 }}>{dl.title}</td>
                  <td>{new Date(dl.dueAt).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge ${dl.state === "OPEN" ? "badge-blue" : dl.state === "SATISFIED" ? "badge-green" : "badge-gray"}`}>
                      {formatStatus(dl.state)}
                    </span>
                  </td>
                  <td>
                    {dl.escalationLevel > 0 ? <span className="sla-chip purple">L{dl.escalationLevel}</span> : "—"}
                  </td>
                </tr>
              ))}
              {app.deadlineItems.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <span style={{ color: "var(--forest-muted)", fontSize: 13 }}>No deadlines recorded.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Undertakings</span>
            <Link href="/undertakings" className="btn btn-secondary btn-sm">View All &rarr;</Link>
          </div>
          {app.undertakings.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--forest-muted)" }}>No conditional undertakings on this application.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {app.undertakings.map((ut) => (
                <div
                  key={ut.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{ut.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--forest-muted)" }}>
                      Due {new Date(ut.dueDate).toLocaleDateString()}
                    </div>
                  </div>
                  <span className={`badge ${ut.status === "VERIFIED" ? "badge-green" : ut.status === "OVERDUE" ? "badge-red" : "badge-amber"}`}>
                    {formatStatus(ut.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Institution Documents &amp; Leases</span>
            <Link href="/documents" className="btn btn-secondary btn-sm">View All &rarr;</Link>
          </div>
          {app.institution.documents.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--forest-muted)" }}>No registered documents found.</p>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {app.institution.documents.map((doc) => (
                <div
                  key={doc.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: "var(--bg)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{doc.title}</div>
                    <div style={{ fontSize: 11.5, color: "var(--forest-muted)" }}>
                      {formatDocType(doc.docType)} · Valid until {new Date(doc.validUntil).toLocaleDateString()}
                    </div>
                  </div>
                  <span className={`badge ${doc.status === "EXPIRED" ? "badge-red" : doc.status === "EXPIRING" ? "badge-amber" : "badge-green"}`}>
                    {formatStatus(doc.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Institution Details</span>
        </div>
        <div className="grid-3">
          {[
            ["AICTE ID", app.institution.aicteId],
            ["Name", app.institution.name],
            ["Category", app.institution.type],
            ["State", app.institution.state],
            ["Email", app.institution.contactEmail],
            ["Phone", app.institution.contactPhone],
          ].map(([k, v]) => (
            <div
              key={k}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                background: "var(--bg)",
                border: "1px solid var(--border)",
              }}
            >
              <div style={{ fontWeight: 700, fontSize: 11, color: "var(--forest-muted)", textTransform: "uppercase", marginBottom: 3 }}>
                {k}
              </div>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--forest)" }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
