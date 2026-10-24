import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { getNow } from "@/lib/clock";
import { formatDeadlineKind } from "@/lib/format";
import Link from "next/link";
import { ResolveEscalationButton } from "./ResolveEscalationButton";

export default async function EscalationsPage({
  searchParams,
}: {
  searchParams: Promise<{ showResolved?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"].includes(user.role)) redirect("/dashboard");

  const now = await getNow();
  const showResolved = (await searchParams).showResolved === "1";

  const where: Record<string, unknown> = showResolved
    ? { escalationResolvedAt: { not: null } }
    : { escalationLevel: { gt: 0 }, state: "OPEN", escalationResolvedAt: null };
  if (user.role === "REGIONAL_OFFICER") where.regionId = user.regionId;

  const items = await prisma.deadlineItem.findMany({
    where,
    include: {
      escalationEvents: {
        include: { escalatedTo: { select: { name: true, role: true } } },
        orderBy: { createdAt: "desc" },
      },
      application: { select: { refNo: true } },
    },
    orderBy: [{ escalationLevel: "desc" }, { dueAt: "asc" }],
    take: 100,
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Escalations</h1>
          <p className="page-subtitle">{items.length} open escalated item(s)</p>
        </div>
        <Link href={showResolved ? "/escalations" : "/escalations?showResolved=1"} className="btn btn-secondary btn-sm">
          {showResolved ? "Show Open" : "Show Resolved"}
        </Link>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {[
          { level: 1, title: "Level 1", sub: "Senior Regional Officer", cls: "purple", color: "var(--purple)" },
          { level: 2, title: "Level 2", sub: "Bureau Officer", cls: "amber", color: "var(--amber)" },
          { level: 3, title: "Level 3", sub: "Directorate", cls: "red", color: "var(--red)" },
        ].map((meta) => (
          <div key={meta.level} className={`kpi-card ${meta.cls}`}>
            <div className="kpi-label">{meta.title}</div>
            <div className="kpi-value" style={{ color: meta.color }}>
              {items.filter((i) => i.escalationLevel === meta.level).length}
            </div>
            <div className="kpi-sub">{meta.sub}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Escalated Deadlines</span>
          <span className="badge badge-purple">{items.length}</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Kind</th>
                <th>Due Date</th>
                <th>Overdue</th>
                <th>Level</th>
                <th>Escalated To</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const overdueDays = differenceInCalendarDays(now, item.dueAt);
                const lastEsc = item.escalationEvents[0];
                return (
                  <tr key={item.id}>
                    <td>
                      {item.applicationId ? (
                        <Link href={`/applications/${item.applicationId}`} className="table-link">
                          {item.title}
                        </Link>
                      ) : (
                        <span style={{ fontWeight: 600 }}>{item.title}</span>
                      )}
                    </td>
                    <td><span className="badge badge-blue">{formatDeadlineKind(item.kind)}</span></td>
                    <td>{new Date(item.dueAt).toLocaleDateString()}</td>
                    <td><span className="sla-chip red">Overdue {Math.max(0, overdueDays)}d</span></td>
                    <td>
                      <span
                        className={`sla-chip ${
                          item.escalationLevel >= 3 ? "red" : item.escalationLevel === 2 ? "amber" : "purple"
                        }`}
                      >
                        L{item.escalationLevel}
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {lastEsc?.escalatedTo.name ?? "Senior Officer"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {item.applicationId ? (
                          <Link href={`/applications/${item.applicationId}`} className="btn btn-primary btn-sm">
                            Open
                          </Link>
                        ) : (
                          <Link href="/undertakings" className="btn btn-secondary btn-sm">
                            View
                          </Link>
                        )}
                        {!item.escalationResolvedAt && <ResolveEscalationButton id={item.id} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <h3>No Open Escalations</h3>
                      <p>All items are within SLA.</p>
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
