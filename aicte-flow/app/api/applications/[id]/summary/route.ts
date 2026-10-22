import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { differenceInCalendarDays } from "date-fns";
import { ROUTES, STAGES } from "@/config/rules";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const app = await prisma.application.findUnique({
    where: { id },
    include: {
      institution: true,
      assignedTo: { select: { name: true, role: true } },
      stages: { orderBy: { enteredAt: "asc" }, include: { enteredBy: { select: { name: true } } } },
      observations: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, role: true } } } },
      deadlineItems: { where: { state: "OPEN" } },
      undertakings: true,
    },
  });

  if (!app) return new NextResponse("Not found", { status: 404 });

  const now = new Date();
  const routeStages = ROUTES[app.route as keyof typeof ROUTES] ?? [];

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Case Summary – ${app.refNo}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 40px auto; padding: 20px; color: #1a202c; }
    h1 { font-size: 22px; color: #1e3a5f; margin-bottom: 4px; }
    .disclaimer { background: #fffbeb; border: 1px solid #fbbf24; padding: 12px 16px; border-radius: 6px; font-size: 12px; color: #7c5c00; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #f8fafc; text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; border-bottom: 1px solid #e2e8f0; }
    td { padding: 9px 12px; border-bottom: 1px solid #f0f4f8; font-size: 13px; }
    h2 { font-size: 15px; color: #1e3a5f; margin: 20px 0 10px; border-bottom: 2px solid #1e3a5f; padding-bottom: 4px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; }
    .badge-blue { background: #dbeafe; color: #1d4ed8; }
    .badge-green { background: #dcfce7; color: #15803d; }
    .badge-red { background: #fee2e2; color: #b91c1c; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="disclaimer">
    ⚠️ <strong>System-generated summary to support, not replace, officer verification.</strong>
    This document is auto-generated and should be used only as a reference aid. All statutory scrutiny, verification and decisions must be made by the competent authority.
  </div>

  <h1>Case Summary: ${app.refNo}</h1>
  <p style="color: #64748b; font-size: 13px; margin-bottom: 24px;">Generated: ${now.toLocaleString()} | AICTE Approval Workflow System</p>

  <h2>Application Details</h2>
  <table>
    <tr><th>Field</th><th>Value</th></tr>
    <tr><td>Reference Number</td><td><strong>${app.refNo}</strong></td></tr>
    <tr><td>Institution</td><td>${app.institution.name} (AICTE ID: ${app.institution.aicteId})</td></tr>
    <tr><td>State</td><td>${app.institution.state}</td></tr>
    <tr><td>Application Type</td><td>${app.applicationType.replace("_", " ")}</td></tr>
    <tr><td>Route</td><td>${app.route.replace(/_/g, " ")}</td></tr>
    <tr><td>Current Stage</td><td>${STAGES[app.currentStageKey]?.label ?? app.currentStageKey}</td></tr>
    <tr><td>Status</td><td>${app.status}</td></tr>
    <tr><td>Assigned To</td><td>${app.assignedTo?.name ?? "Unassigned"} (${app.assignedTo?.role ?? ""})</td></tr>
    <tr><td>Submitted At</td><td>${new Date(app.submittedAt).toLocaleDateString()}</td></tr>
  </table>

  <h2>Stage History</h2>
  <table>
    <tr><th>Stage</th><th>Entered</th><th>Exited</th><th>Duration</th><th>Outcome</th></tr>
    ${app.stages.map((s) => `
      <tr>
        <td>${STAGES[s.stageKey]?.label ?? s.stageKey}</td>
        <td>${new Date(s.enteredAt).toLocaleDateString()}</td>
        <td>${s.exitedAt ? new Date(s.exitedAt).toLocaleDateString() : "—"}</td>
        <td>${s.exitedAt ? `${differenceInCalendarDays(s.exitedAt, s.enteredAt)} days` : "Ongoing"}</td>
        <td>${s.outcome ?? "—"}</td>
      </tr>
    `).join("")}
  </table>

  <h2>Observations (${app.observations.length})</h2>
  ${app.observations.length === 0 ? "<p>No observations.</p>" : `
  <table>
    <tr><th>Kind</th><th>Author</th><th>Date</th><th>Text</th></tr>
    ${app.observations.map((o) => `
      <tr>
        <td>${o.kind}</td>
        <td>${o.author.name}</td>
        <td>${new Date(o.createdAt).toLocaleDateString()}</td>
        <td>${o.text}</td>
      </tr>
    `).join("")}
  </table>
  `}

  <h2>Open Deadlines</h2>
  ${app.deadlineItems.length === 0 ? "<p>No open deadlines.</p>" : `
  <table>
    <tr><th>Kind</th><th>Title</th><th>Due</th><th>Escalation Level</th></tr>
    ${app.deadlineItems.map((d) => `
      <tr>
        <td>${d.kind.replace("_", " ")}</td>
        <td>${d.title}</td>
        <td>${new Date(d.dueAt).toLocaleDateString()}</td>
        <td>${d.escalationLevel > 0 ? `L${d.escalationLevel}` : "—"}</td>
      </tr>
    `).join("")}
  </table>
  `}

  <button class="no-print" onclick="window.print()" style="background: #2a5298; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; margin-top: 16px;">🖨️ Print / Save as PDF</button>
</body>
</html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}
