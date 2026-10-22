import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { getNow } from "@/lib/clock";
import Link from "next/link";

export default async function EscalationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"].includes(user.role)) redirect("/dashboard");

  const now = await getNow();

  const where: Record<string, unknown> = { escalationLevel: { gt: 0 }, state: "OPEN" };
  if (user.role === "REGIONAL_OFFICER") where.regionId = user.regionId;

  const items = await prisma.deadlineItem.findMany({
    where,
    include: {
      escalationEvents: { include: { escalatedTo: { select: { name: true, role: true } } }, orderBy: { createdAt: "desc" } },
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
          <p className="page-subtitle">{items.length} escalated item(s) open</p>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {[1, 2, 3].map((level) => (
          <div key={level} className={`kpi-card ${level === 3 ? "red" : level === 2 ? "amber" : "purple"}`}>
            <div className="kpi-label">Level {level} Escalations</div>
            <div className="kpi-value" style={{ color: level === 3 ? "#ef4444" : level === 2 ? "#f59e0b" : "#a855f7" }}>
              {items.filter((i) => i.escalationLevel === level).length}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr><th>Title</th><th>Kind</th><th>Due</th><th>Overdue</th><th>Esc. Level</th><th>Escalated To</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const overdueDays = differenceInCalendarDays(now, item.dueAt);
                const lastEsc = item.escalationEvents[0];
                return (
                  <tr key={item.id}>
                    <td>
                      {item.applicationId ? (
                        <Link href={`/applications/${item.applicationId}`} style={{ color: "#2a5298" }}>{item.title}</Link>
                      ) : item.title}
                    </td>
                    <td><span className="badge badge-blue">{item.kind.replace("_", " ")}</span></td>
                    <td>{new Date(item.dueAt).toLocaleDateString()}</td>
                    <td><span className="sla-chip red">🔴 {Math.max(0, overdueDays)}d</span></td>
                    <td>
                      <span className={`sla-chip ${item.escalationLevel >= 3 ? "red" : item.escalationLevel === 2 ? "amber" : "purple"}`}>
                        🔺 L{item.escalationLevel}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{lastEsc?.escalatedTo.name ?? "—"} ({lastEsc?.escalatedTo.role.split("_")[0] ?? "—"})</td>
                    <td>
                      {item.applicationId && (
                        <Link href={`/applications/${item.applicationId}`} className="btn btn-primary btn-sm">Acknowledge & Act</Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && <tr><td colSpan={7}><div className="empty-state"><h3>No Escalations</h3><p>All items are within SLA.</p></div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
