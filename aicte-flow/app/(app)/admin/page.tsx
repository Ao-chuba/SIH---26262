import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getNow } from "@/lib/clock";
import { AdminControls } from "./AdminControls";
import { ROUTES, STAGES, ALERT_RULES, APP_TYPE_ROUTE_MAP, EVC_NEW_INSTITUTION_DAYS } from "@/config/rules";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const params = await searchParams;
  const initialTab =
    params.tab === "rules" || params.tab === "users" || params.tab === "ticks"
      ? params.tab
      : "clock";

  const [clockRecord, users, tickLogs, ruleConfigs] = await Promise.all([
    prisma.systemClock.findUnique({ where: { id: 1 } }),
    prisma.user.findMany({
      include: { region: { select: { name: true } }, escalatesTo: { select: { name: true, role: true } } },
      orderBy: { role: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { action: "TICK_RUN" },
      orderBy: { seq: "desc" },
      take: 20,
    }),
    prisma.ruleConfig.findMany(),
  ]);

  const now = await getNow();
  const configMap = Object.fromEntries(ruleConfigs.map((c) => [c.key, JSON.parse(c.value)]));

  const currentRules = {
    ROUTES: configMap.ROUTES ?? ROUTES,
    STAGES: configMap.STAGES ?? STAGES,
    ALERT_RULES: configMap.ALERT_RULES ?? ALERT_RULES,
    APP_TYPE_ROUTE_MAP: configMap.APP_TYPE_ROUTE_MAP ?? APP_TYPE_ROUTE_MAP,
    EVC_NEW_INSTITUTION_DAYS: configMap.EVC_NEW_INSTITUTION_DAYS ?? EVC_NEW_INSTITUTION_DAYS,
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Administration</h1>
          <p className="page-subtitle">System calendar, SLA rules, and user hierarchy</p>
        </div>
      </div>

      <AdminControls
        initialTab={initialTab}
        simulatedNow={clockRecord?.simulatedNow?.toISOString() ?? null}
        currentDateIso={now.toISOString()}
        initialRules={currentRules}
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          designation: u.designation ?? "",
          region: u.region?.name ?? "Central",
          escalatesTo: u.escalatesTo?.name ?? "None",
        }))}
        recentTicks={tickLogs.map((t) => ({
          seq: t.seq,
          ts: t.ts.toISOString(),
          payload: t.payload,
        }))}
      />
    </div>
  );
}
