import { getCurrentUser, COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { SidebarNav } from "./SidebarNav";
import { SidebarToggle } from "./SidebarToggle";
import { UserSwitcher } from "./UserSwitcher";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "System Admin",
  BUREAU_OFFICER: "Bureau Officer",
  REGIONAL_OFFICER: "Regional Officer",
  EVC_COMMITTEE: "EVC Committee",
  SAC_SHC_MEMBER: "SAC / SHC Member",
  INSTITUTION: "Institution",
};

const ROLE_SHORT: Record<string, string> = {
  ADMIN: "Admin",
  BUREAU_OFFICER: "Bureau",
  REGIONAL_OFFICER: "Regional",
  EVC_COMMITTEE: "EVC",
  SAC_SHC_MEMBER: "SAC/SHC",
  INSTITUTION: "Institution",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const unreadCount = await prisma.notification.count({
    where: { toUserId: user.id, readAt: null },
  });

  const clock = await prisma.systemClock.findUnique({ where: { id: 1 } });
  const isSimulating = !!clock?.simulatedNow;

  const allUsers = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  const isInstitution = user.role === "INSTITUTION";

  async function switchUser(formData: FormData) {
    "use server";
    const userId = formData.get("userId") as string;
    const requestedReturnTo = formData.get("returnTo");
    const returnTo =
      typeof requestedReturnTo === "string" && requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//")
        ? requestedReturnTo
        : "/dashboard";
    if (!userId) return;
    const picked = await prisma.user.findUnique({ where: { id: userId } });
    if (!picked) return;
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, userId, { httpOnly: true, path: "/", sameSite: "lax" });
    await appendAudit({
      actorId: picked.id,
      actorRole: picked.role,
      action: "LOGIN_SWITCH",
      entityType: "User",
      entityId: picked.id,
      payload: { userId: picked.id, role: picked.role },
    });
    redirect(returnTo);
  }

  const navItems = [
    { href: "/dashboard", label: "Dashboard", roles: ["all"] },
    { href: "/demo", label: "Jury Demo", roles: ["all"] },
    { href: "/applications", label: "Applications", roles: ["all"] },
    ...(!isInstitution
      ? [
          {
            href: "/evc",
            label: "EVC Inspections",
            roles: ["REGIONAL_OFFICER", "BUREAU_OFFICER", "EVC_COMMITTEE", "ADMIN"],
          },
        ]
      : []),
    ...(!isInstitution
      ? [{ href: "/undertakings", label: "Undertakings", roles: ["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"] }]
      : [{ href: "/undertakings", label: "Undertakings", roles: ["INSTITUTION"] }]),
    {
      href: "/documents",
      label: "Documents",
      roles: ["INSTITUTION", "REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"],
    },
    { href: "/escalations", label: "Escalations", roles: ["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"] },
    { href: "/notifications", label: "Notifications", roles: ["all"] },
    { href: "/reports", label: "Reports", roles: ["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"] },
    { href: "/audit", label: "Audit Trail", roles: ["BUREAU_OFFICER", "ADMIN", "REGIONAL_OFFICER"] },
    { href: "/admin", label: "Admin", roles: ["ADMIN"] },
  ]
    .filter((item) => item.roles.includes("all") || item.roles.includes(user.role))
    .map(({ href, label }) => ({ href, label }));

  const roleAccent =
    user.role === "INSTITUTION"
      ? "#18633B"
      : user.role === "REGIONAL_OFFICER"
        ? "#14281D"
        : user.role === "BUREAU_OFFICER"
          ? "#3B4B9C"
          : user.role === "EVC_COMMITTEE"
            ? "#946200"
            : user.role === "SAC_SHC_MEMBER"
              ? "#5B21B6"
              : "#5A6B60";

  const roleBadgeBg =
    user.role === "INSTITUTION"
      ? "var(--accent-sage)"
      : user.role === "REGIONAL_OFFICER"
        ? "var(--highlighter-yellow)"
        : user.role === "BUREAU_OFFICER"
          ? "var(--accent-blue)"
          : user.role === "EVC_COMMITTEE"
            ? "#FEF3C7"
            : user.role === "SAC_SHC_MEMBER"
              ? "#E4EAFE"
              : "var(--accent-peach)";

  return (
    <div data-role={user.role}>
      <div className="role-accent-stripe" style={{ background: roleAccent }} />
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: 12, textDecoration: "none" }}>
            <img
              src="/logo.png"
              alt="AICTE Logo"
              style={{ width: 34, height: 34, objectFit: "contain", borderRadius: 8, flexShrink: 0 }}
            />
            <div>
              <h1>
                AICTE Flow<span className="logo-dot" />
              </h1>
              <p>Approval &amp; Compliance Portal</p>
            </div>
          </Link>
        </div>

        <SidebarNav items={navItems} unreadCount={unreadCount} />

        <div className="sidebar-user">
          <div className="sidebar-user-title">Signed In As</div>
          <div className="sidebar-user-name">
            {user.name.replace(/^Institution User\s*[–-]\s*/i, "").trim()}
          </div>
          <div className="sidebar-user-role" style={{ background: roleBadgeBg }}>
            {ROLE_LABELS[user.role] ?? user.role}
          </div>
          <div style={{ marginTop: 10 }}>
            <Link
              href="/"
              className="btn btn-secondary btn-sm"
              style={{ width: "100%", justifyContent: "space-between", fontSize: 11.5 }}
            >
              <span>Switch Role</span>
              <span style={{ fontFamily: "var(--font-sans)" }}>&rarr;</span>
            </Link>
          </div>
        </div>
      </aside>

      {/* Topbar */}
      <header className="topbar">
        <SidebarToggle />
        <div className="topbar-title" id="page-title">
          <span>AICTE Approval Workflow</span>
        </div>

        {isSimulating && (
          <Link href={user.role === "ADMIN" ? "/admin" : "/dashboard"} className="clock-badge" title="Simulated clock active">
            Sim Clock: {new Date(clock!.simulatedNow!).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </Link>
        )}

        <div className="role-persona-badge" style={{ background: roleBadgeBg }}>
          {ROLE_SHORT[user.role] ?? user.role}
        </div>

        <div className="user-switcher">
          <UserSwitcher
            users={allUsers}
            currentUserId={user.id}
            action={switchUser}
            roleLabels={ROLE_SHORT}
          />
        </div>

        <Link href="/notifications" className="notif-bell" title="Notifications">
          <span>Alerts</span>
          {unreadCount > 0 && <span className="notif-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </Link>
      </header>

      {/* Main content */}
      <main className="main">
        <div className="main-body">{children}</div>

        <footer className="safeguards-banner">
          <strong>Statutory Notice:</strong>
          <span>
            Workflow routing and APH checks assist scrutiny; final approvals rest with the competent authority.
          </span>
          <span style={{ marginLeft: 8, opacity: 0.9 }}>
            · Demo mode: cookie role switch · Email/SMS simulated in delivery log
          </span>
        </footer>
      </main>
    </div>
  );
}
