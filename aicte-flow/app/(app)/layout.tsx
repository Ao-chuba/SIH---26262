import { getCurrentUser, COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const unreadCount = await prisma.notification.count({
    where: { toUserId: user.id, readAt: null },
  });

  const clock = await prisma.systemClock.findUnique({ where: { id: 1 } });
  const isSimulating = !!clock?.simulatedNow;

  const allUsers = await prisma.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });

  const isAdmin = user.role === "ADMIN";
  const isBureau = user.role === "BUREAU_OFFICER";
  const isRegional = user.role === "REGIONAL_OFFICER";
  const isEVC = user.role === "EVC_COMMITTEE" || user.role === "SAC_SHC_MEMBER";
  const isInstitution = user.role === "INSTITUTION";

  async function switchUser(formData: FormData) {
    "use server";
    const userId = formData.get("userId") as string;
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, userId, { httpOnly: true, path: "/", sameSite: "lax" });
    redirect("/dashboard");
  }

  const navItems = [
    { href: "/dashboard", icon: "📊", label: "Dashboard", roles: ["all"] },
    { href: "/applications", icon: "📋", label: "Applications", roles: ["all"] },
    ...(!isInstitution ? [{ href: "/evc", icon: "🔍", label: "EVC Management", roles: ["REGIONAL_OFFICER", "BUREAU_OFFICER", "EVC_COMMITTEE", "ADMIN"] }] : []),
    ...(!isInstitution ? [{ href: "/undertakings", icon: "📝", label: "Undertakings", roles: ["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"] }] : [{ href: "/undertakings", icon: "📝", label: "My Undertakings", roles: ["all"] }]),
    { href: "/documents", icon: "📄", label: "Documents", roles: ["all"] },
    { href: "/escalations", icon: "⚠️", label: "Escalations", roles: ["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"] },
    { href: "/notifications", icon: "🔔", label: "Notifications", roles: ["all"] },
    { href: "/reports", icon: "📈", label: "Reports", roles: ["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"] },
    { href: "/audit", icon: "🔒", label: "Audit Trail", roles: ["BUREAU_OFFICER", "ADMIN", "REGIONAL_OFFICER"] },
    { href: "/admin", icon: "⚙️", label: "Admin", roles: ["ADMIN"] },
  ].filter((item) => item.roles.includes("all") || item.roles.includes(user.role));

  const roleAccent =
    user.role === "INSTITUTION"
      ? "#059669"
      : user.role === "REGIONAL_OFFICER"
        ? "#1e40af"
        : user.role === "BUREAU_OFFICER"
          ? "#7c3aed"
          : user.role === "EVC_COMMITTEE" || user.role === "SAC_SHC_MEMBER"
            ? "#d97706"
            : "#475569";

  return (
    <div data-role={user.role}>
      <div className="role-accent-stripe" style={{ background: roleAccent }} />
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>🎓 AICTE Flow</h1>
          <p>Approval & Compliance System</p>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">Navigation</div>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="nav-item">
              <span>{item.icon}</span>
              <span>{item.label}</span>
              {item.href === "/notifications" && unreadCount > 0 && (
                <span className="badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
              )}
            </Link>
          ))}
        </nav>

        <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 4 }}>Signed in as</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>{user.name}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 1 }}>{user.role.replace("_", " ")}</div>
          <form action="/api/auth/logout" method="POST">
            <Link href="/" style={{ display: "inline-block", marginTop: 8, fontSize: 11, color: "rgba(255,255,255,0.4)", textDecoration: "underline" }}>
              Switch user →
            </Link>
          </form>
        </div>
      </aside>

      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-title" id="page-title">AICTE Approval Workflow</div>

        {isSimulating && (
          <div className="clock-badge">
            🕒 Simulated: {new Date(clock!.simulatedNow!).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        )}

        <div
          className="role-persona-badge"
          style={{
            background: `${roleAccent}14`,
            border: `1px solid ${roleAccent}55`,
            color: roleAccent,
            fontSize: 11,
            fontWeight: 700,
            padding: "4px 10px",
            borderRadius: 999,
            whiteSpace: "nowrap",
          }}
        >
          {user.role.replace(/_/g, " ")}
        </div>

        <div className="user-switcher">
          <form action={switchUser} style={{ display: "flex", gap: 6 }}>
            <select name="userId" defaultValue={user.id} style={{ fontSize: 12, padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: 6, background: "#fff", cursor: "pointer", maxWidth: 220 }}>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  [{u.role.split("_")[0]}] {u.name.split("–")[0].trim()}
                </option>
              ))}
            </select>
            <button type="submit" style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              Switch
            </button>
          </form>
        </div>

        <Link href="/notifications" className="notif-bell">
          🔔
          {unreadCount > 0 && <span className="notif-count">{unreadCount > 9 ? "9+" : unreadCount}</span>}
        </Link>
      </header>

      {/* Main content */}
      <main className="main" style={{ paddingBottom: 80 }}>
        {children}
      </main>

      {/* Safeguards banner */}
      <div className="safeguards-banner">
        ⚠️ Automated alerts and workflow actions support the approval process. They do not replace statutory scrutiny, verification, inspection or decisions of the competent authority.
      </div>
    </div>
  );
}
