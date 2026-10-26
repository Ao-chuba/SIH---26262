import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { formatStatus } from "@/lib/format";
import { getGatewayStatus } from "@/lib/notify";
import { LiveAlertTester } from "./LiveAlertTester";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; kind?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const params = await searchParams;
  const canSeeDelivery = user.role === "ADMIN" || user.role === "BUREAU_OFFICER" || user.role === "REGIONAL_OFFICER";
  const activeTab = params.tab === "delivery" && canSeeDelivery ? "delivery" : "inbox";
  const gatewayStatus = getGatewayStatus();

  const [inbox, deliveryLog] = await Promise.all([
    prisma.notification.findMany({
      where: {
        toUserId: user.id,
        ...(params.kind ? { kind: params.kind } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    canSeeDelivery
      ? prisma.notification.findMany({
          where: {
            channel: { in: ["EMAIL", "SMS"] },
            ...(user.role === "REGIONAL_OFFICER" && user.regionId
              ? {
                  OR: [
                    { toUser: { regionId: user.regionId } },
                    { toUser: { institution: { regionId: user.regionId } } },
                  ],
                }
              : {}),
          },
          include: { toUser: { select: { name: true, email: true, role: true } } },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : Promise.resolve([]),
  ]);

  async function markRead(formData: FormData) {
    "use server";
    const current = await getCurrentUser();
    if (!current) return;
    const id = formData.get("id") as string;
    if (!id) return;
    await prisma.notification.updateMany({
      where: { id, toUserId: current.id },
      data: { readAt: new Date() },
    });
    redirect("/notifications");
  }

  async function markAllRead() {
    "use server";
    const current = await getCurrentUser();
    if (!current) return;
    await prisma.notification.updateMany({
      where: { toUserId: current.id, readAt: null },
      data: { readAt: new Date() },
    });
    redirect("/notifications");
  }

  const kindColors: Record<string, string> = {
    REMINDER: "badge-blue",
    OVERDUE: "badge-red",
    ESCALATION: "badge-purple",
    INFO: "badge-gray",
    RETURN: "badge-amber",
  };

  const statusColors: Record<string, string> = {
    DELIVERED: "badge-green",
    SENT_SANDBOX: "badge-blue",
    SIMULATED: "badge-gray",
    FAILED: "badge-red",
  };

  const unreadCount = inbox.filter((n) => !n.readAt).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Notifications &amp; Alerts</h1>
          <p className="page-subtitle">{unreadCount} unread inbox alerts</p>
        </div>
        {unreadCount > 0 && activeTab === "inbox" && (
          <form action={markAllRead}>
            <button type="submit" className="btn btn-secondary btn-sm">
              Mark All Read
            </button>
          </form>
        )}
      </div>

      <div className="tabs">
        <Link
          href="/notifications?tab=inbox"
          className={`tab ${activeTab === "inbox" ? "active" : ""}`}
          style={{ textDecoration: "none" }}
        >
          Inbox ({inbox.length})
        </Link>
        {canSeeDelivery && (
          <Link
            href="/notifications?tab=delivery"
            className={`tab ${activeTab === "delivery" ? "active" : ""}`}
            style={{ textDecoration: "none" }}
          >
            Outbound Email &amp; SMS Log ({deliveryLog.length})
          </Link>
        )}
      </div>

      {activeTab === "inbox" && (
        <div className="card">
          {inbox.length === 0 && (
            <div className="empty-state">
              <h3>No Notifications</h3>
              <p>No alerts in your inbox.</p>
            </div>
          )}
          <div style={{ display: "grid", gap: 10 }}>
            {inbox.map((notif) => (
              <div
                key={notif.id}
                style={{
                  padding: "14px 16px",
                  borderRadius: 14,
                  border: notif.readAt ? "1px solid var(--border)" : "1.5px solid var(--forest)",
                  background: notif.readAt ? "var(--card-bg)" : "var(--highlighter-yellow-soft)",
                  display: "flex",
                  gap: 14,
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <span className={`badge ${kindColors[notif.kind] ?? "badge-gray"}`}>{formatStatus(notif.kind)}</span>
                    <span className="badge badge-gray">{formatStatus(notif.channel)}</span>
                    {!notif.readAt && <span className="badge badge-green">Unread</span>}
                    <span style={{ fontSize: 11.5, color: "var(--forest-muted)", fontFamily: "var(--font-mono)" }}>
                      {new Date(notif.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "var(--forest)" }}>{notif.subject}</div>
                  <div style={{ fontSize: 13, color: "var(--forest-muted)", marginTop: 3 }}>{notif.body}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {notif.applicationId && (
                    <Link href={`/applications/${notif.applicationId}`} className="btn btn-primary btn-sm">
                      Open File
                    </Link>
                  )}
                  {!notif.readAt && (
                    <form action={markRead}>
                      <input type="hidden" name="id" value={notif.id} />
                      <button type="submit" className="btn btn-secondary btn-sm">
                        Mark Read
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "delivery" && canSeeDelivery && (
        <div>
          <LiveAlertTester gatewayStatus={gatewayStatus} />

          <div className="card">
            <div className="card-header">
              <span className="card-title">Outbound Email &amp; SMS Dispatch Log</span>
              <span className="badge badge-blue">{deliveryLog.length}</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Kind</th>
                    <th>Recipient</th>
                    <th>Delivery Status</th>
                    <th>Message &amp; Sandbox</th>
                    <th>Sent At</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveryLog.map((n) => (
                    <tr key={n.id}>
                      <td>
                        <span className={`badge ${n.channel === "EMAIL" ? "badge-blue" : "badge-amber"}`}>
                          {formatStatus(n.channel)}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${kindColors[n.kind] ?? "badge-gray"}`}>{formatStatus(n.kind)}</span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{n.toUser?.name ?? "System User"}</div>
                        <div className="font-mono" style={{ fontSize: 11, color: "var(--forest-muted)" }}>
                          {n.toUser?.email ?? ""}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${statusColors[n.deliveryStatus ?? "SIMULATED"] ?? "badge-gray"}`}>
                          {n.deliveryStatus ? n.deliveryStatus.replace("_", " ") : "SIMULATED"}
                        </span>
                      </td>
                      <td style={{ maxWidth: 380 }}>
                        <div style={{ fontWeight: 700, color: "var(--forest)" }}>{n.subject}</div>
                        <div style={{ fontSize: 12, color: "var(--forest-muted)", marginTop: 2 }}>{n.body}</div>
                        {n.previewUrl && (
                          <div style={{ marginTop: 6 }}>
                            <a
                              href={n.previewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-secondary btn-sm"
                              style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, padding: "2px 8px" }}
                            >
                              <ExternalLink size={12} />
                              View Outbound Email ↗
                            </a>
                          </div>
                        )}
                      </td>
                      <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{new Date(n.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                  {deliveryLog.length === 0 && (
                    <tr>
                      <td colSpan={6}>
                        <div className="empty-state">
                          <p>No outbound dispatches recorded.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
