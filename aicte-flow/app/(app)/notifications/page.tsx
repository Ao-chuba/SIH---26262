import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; kind?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const params = await searchParams;

  const where: Record<string, unknown> = { toUserId: user.id };
  if (params.channel) where.channel = params.channel;
  if (params.kind) where.kind = params.kind;

  const [inbox, deliveryLog] = await Promise.all([
    prisma.notification.findMany({
      where: { toUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    (user.role === "ADMIN" || user.role === "BUREAU_OFFICER")
      ? prisma.notification.findMany({
          where: { channel: { in: ["EMAIL", "SMS"] } },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : Promise.resolve([]),
  ]);

  async function markRead(formData: FormData) {
    "use server";
    const id = formData.get("id") as string;
    await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  const kindColors: Record<string, string> = {
    REMINDER: "badge-blue", OVERDUE: "badge-red", ESCALATION: "badge-purple",
    INFO: "badge-gray", RETURN: "badge-amber",
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">{inbox.filter((n) => !n.readAt).length} unread</p>
        </div>
      </div>

      <div className="tabs">
        <span className="tab active">[INBOX] Inbox ({inbox.length})</span>
        {(user.role === "ADMIN" || user.role === "BUREAU_OFFICER") && (
          <span className="tab">[DELIVERY] Delivery Log ({deliveryLog.length})</span>
        )}
      </div>

      <div className="card">
        {inbox.length === 0 && (
          <div className="empty-state">
            <h3>No Notifications</h3>
            <p>You're all caught up!</p>
          </div>
        )}
        {inbox.map((notif) => (
          <div key={notif.id} style={{
            padding: "14px 0",
            borderBottom: "1px solid #f0f4f8",
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
            background: notif.readAt ? "transparent" : "#f8faff",
            borderRadius: notif.readAt ? 0 : 6,
            paddingLeft: notif.readAt ? 0 : 10,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span className={`badge ${kindColors[notif.kind] ?? "badge-gray"}`}>{notif.kind}</span>
                <span className="badge badge-gray">{notif.channel}</span>
                {!notif.readAt && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", display: "inline-block" }} />}
              </div>
              <div style={{ fontWeight: notif.readAt ? 400 : 600, fontSize: 13 }}>{notif.subject}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{notif.body}</div>
              <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{new Date(notif.createdAt).toLocaleString()}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {notif.applicationId && (
                <Link href={`/applications/${notif.applicationId}`} className="btn btn-secondary btn-sm">View -&gt;</Link>
              )}
              {!notif.readAt && (
                <form action={markRead}>
                  <input type="hidden" name="id" value={notif.id} />
                  <button type="submit" className="btn btn-secondary btn-sm">Mark read</button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>

      {deliveryLog.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title" style={{ marginBottom: 12 }}>[LOG] Simulated Delivery Log (EMAIL/SMS)</div>
          <table className="data-table">
            <thead><tr><th>Channel</th><th>Kind</th><th>Subject</th><th>Sent At</th></tr></thead>
            <tbody>
              {deliveryLog.map((n) => (
                <tr key={n.id}>
                  <td><span className={`badge ${n.channel === "EMAIL" ? "badge-blue" : "badge-amber"}`}>{n.channel}</span></td>
                  <td><span className={`badge ${kindColors[n.kind] ?? "badge-gray"}`}>{n.kind}</span></td>
                  <td>{n.subject}</td>
                  <td style={{ fontSize: 12 }}>{new Date(n.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
