import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getNow } from "@/lib/clock";
import { differenceInCalendarDays } from "date-fns";
import { STAGES } from "@/config/rules";
import { formatAppType, formatDeadlineKind, formatOutcome, formatRole, formatRoute, formatStatus } from "@/lib/format";
import { canViewApplication, requireAuth } from "@/lib/auth";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safe(value: unknown): string {
  return escapeHtml(String(value ?? ""));
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth().catch(() => null);
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const app = await prisma.application.findUnique({
    where: { id },
    include: {
      institution: true,
      assignedTo: { select: { name: true, role: true } },
      stages: { orderBy: { enteredAt: "asc" }, include: { enteredBy: { select: { name: true } } } },
      observations: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, role: true } } } },
      deadlineItems: { where: { state: "OPEN" } },
      undertakings: true,
      evcVisit: { select: { committeeId: true } },
    },
  });

  if (!app) return new NextResponse("Not found", { status: 404 });
  if (!canViewApplication(user, app, app.evcVisit?.committeeId)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const now = await getNow();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Case Summary – ${safe(app.refNo)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    body {
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      background: #FAF8F5;
      color: #14281D;
      max-width: 920px;
      margin: 32px auto;
      padding: 28px;
    }
    .sheet {
      background: #FFFFFF;
      border: 1.5px solid #14281D;
      border-radius: 20px;
      padding: 32px;
      box-shadow: 6px 6px 0px #14281D;
    }
    .header-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 1.5px solid #E5E0D5;
      padding-bottom: 18px;
      margin-bottom: 20px;
      gap: 16px;
    }
    h1 { font-size: 24px; font-weight: 800; color: #14281D; margin: 0 0 4px; letter-spacing: -0.02em; }
    .mono { font-family: 'JetBrains Mono', monospace; }
    .disclaimer {
      background: #FFFDF4;
      border: 1.5px solid #E5D59B;
      padding: 12px 16px;
      border-radius: 12px;
      font-size: 12px;
      color: #5C4813;
      margin-bottom: 24px;
    }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th {
      background: #FAF8F5;
      text-align: left;
      padding: 10px 12px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #4F6155;
      border-bottom: 1.5px solid #E5E0D5;
    }
    td { padding: 10px 12px; border-bottom: 1px solid #E5E0D5; font-size: 13px; }
    h2 {
      font-size: 15px;
      font-weight: 800;
      color: #14281D;
      margin: 24px 0 10px;
      padding-bottom: 6px;
      border-bottom: 1.5px solid #14281D;
    }
    .pill {
      display: inline-block;
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 9999px;
      background: #E6F564;
      border: 1px solid #14281D;
    }
    @media print {
      body { background: #FFFFFF; margin: 0; padding: 0; }
      .sheet { box-shadow: none; border: 1px solid #cbd5e1; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="header-row">
      <div>
        <span class="pill">AICTE FLOW • CASE DOCKET</span>
        <h1 style="margin-top: 10px;">Case Summary: <span class="mono">${safe(app.refNo)}</span></h1>
        <p style="color: #4F6155; font-size: 12.5px; margin: 4px 0 0;">
          Generated: ${now.toLocaleString()} | Official Scrutiny &amp; Compliance Record
        </p>
      </div>
      <button class="no-print mono" onclick="window.print()" style="background: #14281D; color: #FAF8F5; border: none; padding: 10px 20px; border-radius: 9999px; cursor: pointer; font-size: 12px; font-weight: 700;">
        Print / Save PDF
      </button>
    </div>

    <div class="disclaimer">
      <strong>Statutory Safeguard:</strong>
      System-generated summary to support officer verification. All statutory scrutiny, inspection, and final approval decisions rest with the competent authority.
    </div>

    <h2>1. Application &amp; Institution Particulars</h2>
    <table>
      <tr><th>Field</th><th>Recorded Value</th></tr>
      <tr><td>Reference Number</td><td class="mono"><strong>${safe(app.refNo)}</strong></td></tr>
      <tr><td>Institution</td><td><strong>${safe(app.institution.name)}</strong> (AICTE ID: ${safe(app.institution.aicteId)})</td></tr>
      <tr><td>State / Discipline</td><td>${safe(app.institution.state)} · ${safe(app.institution.type)}</td></tr>
      <tr><td>Application Type</td><td>${safe(formatAppType(app.applicationType))}</td></tr>
      <tr><td>Workflow Route</td><td>${safe(formatRoute(app.route))}</td></tr>
      <tr><td>Current Stage</td><td><strong>${safe(STAGES[app.currentStageKey]?.label ?? app.currentStageKey)}</strong></td></tr>
      <tr><td>Status</td><td><strong>${safe(formatStatus(app.status))}</strong></td></tr>
      <tr><td>Decision</td><td><strong>${app.decision ? safe(formatStatus(app.decision)) : "—"}</strong></td></tr>
      <tr><td>Decision Remarks</td><td>${app.decisionRemarks ? escapeHtml(app.decisionRemarks) : "—"}</td></tr>
      <tr><td>Assigned Officer</td><td>${safe(app.assignedTo?.name ?? "Unassigned")} (${safe(formatRole(app.assignedTo?.role))})</td></tr>
      <tr><td>Submitted Date</td><td>${new Date(app.submittedAt).toLocaleDateString()}</td></tr>
    </table>

    <h2>2. Stage Progression History</h2>
    <table>
      <tr><th>Stage</th><th>Entered</th><th>Exited</th><th>Duration</th><th>Outcome</th></tr>
      ${app.stages
        .map(
          (s) => `
        <tr>
          <td><strong>${safe(STAGES[s.stageKey]?.label ?? s.stageKey)}</strong></td>
          <td>${new Date(s.enteredAt).toLocaleDateString()}</td>
          <td>${s.exitedAt ? new Date(s.exitedAt).toLocaleDateString() : "Active"}</td>
          <td>${s.exitedAt ? `${Math.max(1, differenceInCalendarDays(s.exitedAt, s.enteredAt))} day(s)` : "In progress"}</td>
          <td>${s.outcome ? safe(formatOutcome(s.outcome)) : "Open"}</td>
        </tr>
      `
        )
        .join("")}
    </table>

    <h2>3. Scrutiny Observations &amp; Deficiency Replies (${app.observations.length})</h2>
    ${
      app.observations.length === 0
        ? "<p style='font-size:13px;color:#4F6155;'>No observations recorded.</p>"
        : `
    <table>
      <tr><th>Category</th><th>Author</th><th>Date</th><th>Observation / Reply</th></tr>
      ${app.observations
        .map(
          (o) => `
        <tr>
          <td><strong>${safe(formatStatus(o.kind))}</strong></td>
          <td>${safe(o.author.name)}</td>
          <td>${new Date(o.createdAt).toLocaleDateString()}</td>
          <td>${safe(o.text)}</td>
        </tr>
      `
        )
        .join("")}
    </table>
    `
    }

    <h2>4. Open SLA Deadlines</h2>
    ${
      app.deadlineItems.length === 0
        ? "<p style='font-size:13px;color:#4F6155;'>No open deadlines.</p>"
        : `
    <table>
      <tr><th>Category</th><th>Title</th><th>Due Date</th><th>Escalation</th></tr>
      ${app.deadlineItems
        .map(
          (d) => `
        <tr>
          <td>${safe(formatDeadlineKind(d.kind))}</td>
          <td>${safe(d.title)}</td>
          <td>${new Date(d.dueAt).toLocaleDateString()}</td>
          <td>${d.escalationLevel > 0 ? `Escalated L${d.escalationLevel}` : "None"}</td>
        </tr>
      `
        )
        .join("")}
    </table>
    `
    }
  </div>
</body>
</html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
