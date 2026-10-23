import { NextRequest, NextResponse } from "next/server";
import { isDenied, requireRoleResponse } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appendAudit } from "@/lib/audit";
import { ROUTES, STAGES, ALERT_RULES, APP_TYPE_ROUTE_MAP } from "@/config/rules";

export async function GET() {
  const gate = await requireRoleResponse(["ADMIN", "BUREAU_OFFICER"]);
  if (isDenied(gate)) return gate;
  const configs = await prisma.ruleConfig.findMany();
  const configMap = Object.fromEntries(configs.map((c) => [c.key, JSON.parse(c.value)]));
  return NextResponse.json({
    routes: configMap.ROUTES ?? ROUTES,
    stages: configMap.STAGES ?? STAGES,
    alertRules: configMap.ALERT_RULES ?? ALERT_RULES,
    appTypeRouteMap: configMap.APP_TYPE_ROUTE_MAP ?? APP_TYPE_ROUTE_MAP,
  });
}

export async function PUT(request: NextRequest) {
  const user = await requireRoleResponse(["ADMIN"]);
  if (isDenied(user)) return user;
  const body = await request.json();
  const { key, value } = body;
  if (!key || value === undefined) {
    return NextResponse.json({ error: "key and value required" }, { status: 400 });
  }

  await prisma.ruleConfig.upsert({
    where: { key },
    create: { key, value: JSON.stringify(value), updatedById: user.id },
    update: { value: JSON.stringify(value), updatedById: user.id },
  });

  await appendAudit({
    actorId: user.id,
    actorRole: user.role,
    action: "RULE_CHANGED",
    entityType: "RuleConfig",
    entityId: key,
    payload: { key, value },
  });

  return NextResponse.json({ success: true });
}
