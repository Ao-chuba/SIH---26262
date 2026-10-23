import { getCurrentUser, COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import {
  LayoutDashboard,
  FileText,
  Users,
  ShieldCheck,
  FolderOpen,
  AlertTriangle,
  Bell,
  BarChart3,
  History,
  Settings,
} from "lucide-react";

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
    { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: ["all"] },
    { href: "/applications", icon: FileText, label: "Applications", roles: ["all"] },
    ...(!isInstitution ? [{ href: "/evc", icon: Users, label: "EVC Management", roles: ["REGIONAL_OFFICER", "BUREAU_OFFICER", "EVC_COMMITTEE", "ADMIN"] }] : []),
    ...(!isInstitution ? [{ href: "/undertakings", icon: ShieldCheck, label: "Undertakings", roles: ["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"] }] : [{ href: "/undertakings", icon: ShieldCheck, label: "My Undertakings", roles: ["all"] }]),
    { href: "/documents", icon: FolderOpen, label: "Documents", roles: ["all"] },
    { href: "/escalations", icon: AlertTriangle, label: "Escalations", roles: ["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"] },
    { href: "/notifications", icon: Bell, label: "Notifications", roles: ["all"] },
    { href: "/reports", icon: BarChart3, label: "Reports", roles: ["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"] },
    { href: "/audit", icon: History, label: "Audit Trail", roles: ["BUREAU_OFFICER", "ADMIN", "REGIONAL_OFFICER"] },
    { href: "/admin", icon: Settings, label: "Admin", roles: ["ADMIN"] },
  ].filter((item) => item.roles.includes("all") || item.roles.includes(user.role));

  const roleAccent =
    user.role === "INSTITUTION"
      ? "#1F6B43"
      : user.role === "REGIONAL_OFFICER"
        ? "#14281D"
        : user.role === "BUREAU_OFFICER"
          ? "#3B4B9C"
          : user.role === "EVC_COMMITTEE" || user.role === "SAC_SHC_MEMBER"
            ? "#946200"
            : "#5A6B60";

  return (
    <div data-role={user.role}>
      <div className="role-accent-stripe" style={{ background: roleAccent }} />
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/logo.png"
            alt="AICTE Logo"
            style={{ width: 34, height: 34, objectFit: "contain", borderRadius: 8 }}
          />
          <div>
            <h1>
              AICTE Flow<span className="logo-dot" />
            </h1>
            <p>Approval & Compliance Platform</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-label">// Navigation</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className="nav-item">
                <Icon size={17} strokeWidth={2.2} style={{ flexShrink: 0, opacity: 0.85 }} />
                <span>{item.label}</span>
                {item.href === "/notifications" && unreadCount > 0 && (
                  <span className="badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-user-title">Active Persona</div>
          <div className="sidebar-user-name">{user.name}</div>
          <div className="sidebar-user-role">[{user.role.replace(/_/g, " ")}]</div>
          <form action="/api/auth/logout" method="POST">
            <Link
              href="/"
              style={{
                display: "inline-block",
                marginTop: 8,
                fontSize: 11,
                fontWeight: 700,
                color: "var(--forest)",
                textDecoration: "underline",
              }}
            >
              Switch Role -&gt;
            </Link>
          </form>
        </div>
      </aside>

      {/* Topbar */}
      <header className="topbar">
        <div className="topbar-title" id="page-title">
          AICTE Approval Workflow
        </div>

        {isSimulating && (
          <div className="clock-badge">
            [SIM-CLOCK: {new Date(clock!.simulatedNow!).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}]
          </div>
        )}

        <div className="role-persona-badge">
          [{user.role.replace(/_/g, " ")}]
        </div>

        <div className="user-switcher">
          <form action={switchUser} style={{ display: "flex", gap: 8 }}>
            <select name="userId" defaultValue={user.id}>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  [{u.role.split("_")[0]}] {u.name.split("–")[0].trim()}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-secondary btn-sm">
              Switch -&gt;
            </button>
          </form>
        </div>

        <Link href="/notifications" className="notif-bell" title="Alerts & Delivery Log">
          <Bell size={14} strokeWidth={2.2} />
          <span>Alerts</span>
          {unreadCount > 0 && <span className="notif-count">{unreadCount > 9 ? "9+" : unreadCount}</span>}
        </Link>
      </header>

      {/* Main content */}
      <main className="main">
        {children}
      </main>
    </div>
  );
}
