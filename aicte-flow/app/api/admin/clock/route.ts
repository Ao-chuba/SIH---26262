import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { setSimulatedNow, addDaysToSimulated, getNow } from "@/lib/clock";
import { tick } from "@/lib/engine/tick";
import { appendAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const user = await requireRole(["ADMIN"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await request.json();

  let newDate: Date;
  let reset = false;
  if (body.reset === true || body.simulatedNow === null) {
    await setSimulatedNow(null);
    newDate = new Date();
    reset = true;
  } else if (body.addDays) {
    newDate = await addDaysToSimulated(Number(body.addDays));
  } else if (body.simulatedNow) {
    newDate = new Date(body.simulatedNow);
    await setSimulatedNow(newDate);
  } else {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  await appendAudit({
    actorId: user.id, actorRole: user.role, action: "CLOCK_CHANGED",
    entityType: "SystemClock", entityId: "1",
    payload: { newDate: newDate.toISOString(), reset, addDays: body.addDays },
  });

  const tickSummary = await tick(newDate);

  return NextResponse.json({
    simulatedNow: reset ? null : newDate.toISOString(),
    tick: tickSummary,
    remindersFired: tickSummary.remindersFired,
    overdueMarked: tickSummary.overdueMarked,
    escalations: tickSummary.escalations,
    tickedAt: tickSummary.tickedAt,
  });
}
