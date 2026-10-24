import { prisma, runTx } from "../db";
import { getNow } from "../clock";
import { notify } from "../notify";
import { appendAudit } from "../audit";
import { ALERT_RULES } from "../../config/rules";
import { differenceInCalendarDays } from "date-fns";

export interface TickSummary {
  remindersFired: number;
  overdueMarked: number;
  escalations: number;
  tickedAt: Date;
}

/**
 * The core deadline/escalation engine tick.
 * Idempotent – safe to call repeatedly.
 */
export async function tick(now?: Date): Promise<TickSummary> {
  const effectiveNow = now ?? (await getNow());
  let remindersFired = 0;
  let overdueMarked = 0;
  let escalations = 0;

  const openItems = await prisma.deadlineItem.findMany({
    where: { state: "OPEN" },
    include: { alertLogs: true },
  });

  let configuredAlertRules = ALERT_RULES;
  try {
    const rc = await prisma.ruleConfig.findUnique({ where: { key: "ALERT_RULES" } });
    if (rc) configuredAlertRules = { ...ALERT_RULES, ...JSON.parse(rc.value) };
  } catch {}

  for (const item of openItems) {
    const daysToDue = differenceInCalendarDays(item.dueAt, effectiveNow);
    const rules = configuredAlertRules[item.kind];
    if (!rules) continue;

    const firedKeys = new Set(item.alertLogs.map((a) => a.alertKey));

    // Promote documents approaching expiry (VALID → EXPIRING within 90 days)
    if (
      item.documentId &&
      item.kind === "DOCUMENT_EXPIRY" &&
      daysToDue >= 0 &&
      daysToDue <= 90
    ) {
      const doc = await prisma.instDocument.findUnique({ where: { id: item.documentId } });
      if (doc?.status === "VALID") {
        await prisma.instDocument.update({
          where: { id: item.documentId },
          data: { status: "EXPIRING" },
        });
      }
    }

    // 1. Pre-due reminders (fire only the most urgent unfired one)
    if (daysToDue >= 0) {
      const sortedReminders = [...rules.reminders].sort((a, b) => b - a);
      const toFire = sortedReminders
        .filter((offset) => daysToDue <= Math.abs(offset) && !firedKeys.has(`T${offset}`))
        .sort((a, b) => b - a); // most urgent (closest to 0, e.g. 0 > -1 > -3) first

      if (toFire.length > 0) {
        const urgentOffset = toFire[0];

        // Mark all skipped ones as fired first
        for (const offset of toFire.slice(1)) {
          await prisma.alertLog.upsert({
            where: { deadlineItemId_alertKey: { deadlineItemId: item.id, alertKey: `T${offset}` } },
            create: { deadlineItemId: item.id, alertKey: `T${offset}`, firedAt: effectiveNow },
            update: {},
          });
        }

        // Fire the urgent one
        await prisma.alertLog.upsert({
          where: { deadlineItemId_alertKey: { deadlineItemId: item.id, alertKey: `T${urgentOffset}` } },
          create: { deadlineItemId: item.id, alertKey: `T${urgentOffset}`, firedAt: effectiveNow },
          update: {},
        });

        if (item.ownerUserId) {
          await notify({
            toUserId: item.ownerUserId,
            kind: "REMINDER",
            subject: `Reminder: ${item.title}`,
            body: `${item.title} is due in ${daysToDue} day(s) (${item.dueAt.toDateString()}).`,
            deadlineItemId: item.id,
            applicationId: item.applicationId ?? undefined,
          });
        }
        if (item.institutionId) {
          await notify({
            toInstitutionId: item.institutionId,
            kind: "REMINDER",
            subject: `Reminder: ${item.title}`,
            body: `${item.title} is due in ${daysToDue} day(s).`,
            deadlineItemId: item.id,
            applicationId: item.applicationId ?? undefined,
          });
        }

        remindersFired++;
        await appendAudit({
          action: "ALERT_FIRED",
          entityType: "DeadlineItem",
          entityId: item.id,
          payload: { alertKey: `T${urgentOffset}`, daysToDue },
        });
      }
    }

    // 2. Overdue
    if (daysToDue < 0) {
      const overdueDays = -daysToDue;

      // Update underlying entity status
      if (item.undertakingId) {
        const undertaking = await prisma.undertaking.findUnique({ where: { id: item.undertakingId } });
        if (undertaking && undertaking.status === "PENDING") {
          await prisma.undertaking.update({
            where: { id: item.undertakingId },
            data: { status: "OVERDUE" },
          });
          overdueMarked++;
          await appendAudit({
            action: "OVERDUE_MARKED",
            entityType: "Undertaking",
            entityId: item.undertakingId,
            payload: { overdueDays },
          });
        }
      }
      if (item.documentId) {
        const doc = await prisma.instDocument.findUnique({ where: { id: item.documentId } });
        if (doc && (doc.status === "VALID" || doc.status === "EXPIRING")) {
          await prisma.instDocument.update({
            where: { id: item.documentId },
            data: { status: "EXPIRED" },
          });
          overdueMarked++;
          await appendAudit({
            action: "OVERDUE_MARKED",
            entityType: "InstDocument",
            entityId: item.documentId,
            payload: { overdueDays },
          });
        }
      }

      // Recurring OVERDUE+k alerts
      const overdueKey = `OVERDUE+${Math.floor(overdueDays / rules.overdueEveryDays) * rules.overdueEveryDays}`;
      if (!firedKeys.has(overdueKey)) {
        await prisma.alertLog.upsert({
          where: { deadlineItemId_alertKey: { deadlineItemId: item.id, alertKey: overdueKey } },
          create: { deadlineItemId: item.id, alertKey: overdueKey, firedAt: effectiveNow },
          update: {},
        });

        if (item.ownerUserId) {
          await notify({
            toUserId: item.ownerUserId,
            kind: "OVERDUE",
            subject: `OVERDUE: ${item.title}`,
            body: `${item.title} is overdue by ${overdueDays} day(s).`,
            deadlineItemId: item.id,
            applicationId: item.applicationId ?? undefined,
          });
        }
        remindersFired++;
      }

      // 3. Escalation
      const sortedSteps = [...rules.escalate].sort((a, b) => a.afterOverdueDays - b.afterOverdueDays);
      for (const step of sortedSteps) {
        if (overdueDays >= step.afterOverdueDays && item.escalationLevel < step.level) {
          const escKey = `ESC-L${step.level}`;
          if (!firedKeys.has(escKey)) {
            // Find escalation target
            let escalateTo: { id: string } | null = null;
            if (item.ownerUserId) {
              const owner = await prisma.user.findUnique({ where: { id: item.ownerUserId } });
              if (owner?.escalatesToId) {
                escalateTo = await prisma.user.findUnique({ where: { id: owner.escalatesToId } });
              }
            }
            if (!escalateTo) {
              if (step.level === 1) {
                escalateTo = await prisma.user.findFirst({
                  where: { role: "REGIONAL_OFFICER", regionId: item.regionId ?? undefined },
                });
              } else if (step.level === 2) {
                escalateTo = await prisma.user.findFirst({ where: { role: "REGIONAL_OFFICER" } });
              } else {
                escalateTo = await prisma.user.findFirst({ where: { role: "BUREAU_OFFICER" } });
              }
            }

            if (escalateTo) {
              await runTx(async (tx) => {
                await tx.escalationEvent.create({
                  data: {
                    deadlineItemId: item.id,
                    fromLevel: item.escalationLevel,
                    toLevel: step.level,
                    escalatedToUserId: escalateTo!.id,
                    reason: `Overdue by ${overdueDays} days`,
                  },
                });
                await tx.deadlineItem.update({
                  where: { id: item.id },
                  data: { escalationLevel: step.level },
                });
                await tx.alertLog.upsert({
                  where: { deadlineItemId_alertKey: { deadlineItemId: item.id, alertKey: escKey } },
                  create: { deadlineItemId: item.id, alertKey: escKey, firedAt: effectiveNow },
                  update: {},
                });
              });

              await notify({
                toUserId: escalateTo.id,
                kind: "ESCALATION",
                subject: `Escalation L${step.level}: ${item.title}`,
                body: `${item.title} has been escalated to you. Overdue by ${overdueDays} days.`,
                deadlineItemId: item.id,
                applicationId: item.applicationId ?? undefined,
              });

              await appendAudit({
                action: "ESCALATED",
                entityType: "DeadlineItem",
                entityId: item.id,
                payload: { toLevel: step.level, escalatedToUserId: escalateTo.id, overdueDays },
              });

              escalations++;
            }
          }
        }
      }
    }
  }

  const summary: TickSummary = { remindersFired, overdueMarked, escalations, tickedAt: effectiveNow };

  await appendAudit({
    action: "TICK_RUN",
    entityType: "System",
    entityId: "engine",
    payload: summary,
  });

  return summary;
}
