import { prisma, runTx } from "../db";
import { appendAudit } from "../audit";
import { getNow } from "../clock";
import { notify } from "../notify";
import {
  assertEvcCommitteeAccess,
  assertInstitutionAccess,
  assertRegionAccess,
  AuthError,
  canAdvanceStage,
  canReturnApplication,
} from "../auth";
import { ROUTES, STAGES, APP_TYPE_ROUTE_MAP, EVC_NEW_INSTITUTION_DAYS, RESPONSE_WINDOW_DAYS } from "../../config/rules";
import { getConfiguredNextStage, getConfiguredRouteStages } from "./routes";
import type { User, Application } from "@prisma/client";

type RouteKey = keyof typeof ROUTES;

type StageConfigMap = typeof STAGES;

async function getConfiguredStages(): Promise<StageConfigMap> {
  try {
    const rc = await prisma.ruleConfig.findUnique({ where: { key: "STAGES" } });
    if (rc) return { ...STAGES, ...JSON.parse(rc.value) };
  } catch {}
  return STAGES;
}

async function getConfiguredEvcNewDays(): Promise<number> {
  try {
    const rc = await prisma.ruleConfig.findUnique({ where: { key: "EVC_NEW_INSTITUTION_DAYS" } });
    if (rc) return Number(JSON.parse(rc.value)) || EVC_NEW_INSTITUTION_DAYS;
  } catch {}
  return EVC_NEW_INSTITUTION_DAYS;
}

/**
 * On application creation, assign route, first stage, assign officer, open deadline.
 */
export async function routeApplication(
  applicationId: string,
  actor: User
): Promise<void> {
  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });

  // Load route mapping from RuleConfig if available
  let routeMap = APP_TYPE_ROUTE_MAP;
  try {
    const rc = await prisma.ruleConfig.findUnique({ where: { key: "APP_TYPE_ROUTE_MAP" } });
    if (rc) routeMap = { ...routeMap, ...JSON.parse(rc.value) };
  } catch {}

  const route: RouteKey = routeMap[app.applicationType] ?? "ONLY_SCRUTINY";
  const stages = await getConfiguredRouteStages(route);
  if (stages.length === 0) throw new Error(`Route ${route} has no configured stages`);
  const firstStage = stages[0];
  const now = await getNow();
  const stageConfigs = await getConfiguredStages();

  // Find an officer to assign (round-robin by lowest open count)
  const officers = await prisma.user.findMany({
    where: { role: stageConfigs[firstStage]?.ownerRole ?? "REGIONAL_OFFICER", regionId: app.regionId },
  });
  let assignedTo = officers[0];
  if (officers.length > 1) {
    const counts = await Promise.all(
      officers.map((o) =>
        prisma.application.count({ where: { assignedToId: o.id, status: "IN_PROGRESS" } })
      )
    );
    const minIdx = counts.indexOf(Math.min(...counts));
    assignedTo = officers[minIdx];
  }

  const stageTimelineDays = stageConfigs[firstStage]?.timelineDays ?? 15;

  await runTx(async (tx) => {
    await tx.application.update({
      where: { id: applicationId },
      data: {
        route,
        currentStageKey: firstStage,
        status: "IN_PROGRESS",
        assignedToId: assignedTo?.id,
        stageEnteredAt: now,
      },
    });

    await tx.applicationStage.create({
      data: {
        applicationId,
        stageKey: firstStage,
        enteredAt: now,
        enteredById: actor.id,
      },
    });

    await tx.deadlineItem.create({
      data: {
        kind: "STAGE_TIMELINE",
        refType: "Application",
        refId: applicationId,
        institutionId: app.institutionId,
        regionId: app.regionId,
        ownerUserId: assignedTo?.id,
        title: `${app.refNo} – ${STAGES[firstStage]?.label ?? firstStage} deadline`,
        dueAt: new Date(now.getTime() + stageTimelineDays * 86400000),
        applicationId,
      },
    });
  });

  await appendAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "ROUTED",
    entityType: "Application",
    entityId: applicationId,
    payload: { route, firstStage, assignedToId: assignedTo?.id },
  });

  if (assignedTo) {
    await notify({
      toUserId: assignedTo.id,
      kind: "INFO",
      subject: `New application assigned: ${app.refNo}`,
      body: `Application ${app.refNo} has been routed to your queue at stage ${STAGES[firstStage]?.label}.`,
      applicationId,
    });
  }
}

/**
 * Advance an application to the next stage.
 */
export async function advanceApplication(
  applicationId: string,
  actor: User,
  note?: string
): Promise<Application> {
  const app = await prisma.application.findUniqueOrThrow({
    where: { id: applicationId },
    include: { evcVisit: true },
  });

  if (app.currentStageKey === "EVC_SCHEDULED") {
    throw new Error("Use Submit EVC Report to complete a scheduled visit — cannot advance from this stage");
  }
  if (app.currentStageKey === "DECISION_PENDING") {
    throw new Error("Use Record Decision for the decision stage — cannot advance");
  }
  if (!canAdvanceStage(actor, app.currentStageKey)) {
    throw new AuthError(`Role ${actor.role} cannot advance stage ${app.currentStageKey}`, 403);
  }
  if (actor.role === "REGIONAL_OFFICER") {
    assertRegionAccess(actor, app.regionId);
  }
  if (actor.role === "SAC_SHC_MEMBER" && app.currentStageKey !== "SAC_SHC") {
    throw new AuthError("SAC/SHC members may only advance hearing-stage files", 403);
  }

  // Guard: illegal transition
  if (app.status !== "IN_PROGRESS" && app.status !== "RETURNED") {
    throw new Error(`Cannot advance application in status ${app.status}`);
  }

  const nextStage = await getConfiguredNextStage(app.route, app.currentStageKey);
  const now = await getNow();
  const stageConfigs = await getConfiguredStages();

  // Close current stage + deadline
  const currentStageRecord = await prisma.applicationStage.findFirst({
    where: { applicationId, stageKey: app.currentStageKey, exitedAt: null },
    orderBy: { enteredAt: "desc" },
  });

  const openDeadline = await prisma.deadlineItem.findFirst({
    where: { refId: applicationId, refType: "Application", state: "OPEN", kind: "STAGE_TIMELINE" },
    orderBy: { openedAt: "desc" },
  });

  let updatedApp: Application;
  let assignedNextOwner: User | null = null;

  await runTx(async (tx) => {
    // Close current stage
    if (currentStageRecord) {
      await tx.applicationStage.update({
        where: { id: currentStageRecord.id },
        data: { exitedAt: now, outcome: "ADVANCED", notes: note },
      });
    }

    // Close current deadline
    if (openDeadline) {
      await tx.deadlineItem.update({
        where: { id: openDeadline.id },
        data: { state: "SATISFIED", closedAt: now },
      });
    }

    if (!nextStage) {
      // Never auto-complete past the human decision gate — misconfigured routes halt here
      throw new Error(
        `No next stage configured after ${app.currentStageKey} on route ${app.route}. Record a Bureau decision or fix ROUTES in Admin.`
      );
    }

    // Assign owner for next stage
    const nextOwnerRole = STAGES[nextStage]?.ownerRole ?? "REGIONAL_OFFICER";
    let nextOwner: User | null = null;

    if (nextStage === "DECISION_PENDING") {
      const bo = await tx.user.findFirst({ where: { role: "BUREAU_OFFICER" } });
      nextOwner = bo;
    } else if (nextOwnerRole === "EVC_COMMITTEE") {
      const evc = await tx.user.findFirst({ where: { role: "EVC_COMMITTEE" } });
      nextOwner = evc;
    } else if (nextOwnerRole === "SAC_SHC_MEMBER") {
      const sac = await tx.user.findFirst({ where: { role: "SAC_SHC_MEMBER" } });
      nextOwner = sac;
    } else {
      nextOwner = await tx.user.findFirst({ where: { role: nextOwnerRole, regionId: app.regionId } });
    }
    assignedNextOwner = nextOwner;

    const stageTimelineDays = stageConfigs[nextStage]?.timelineDays ?? 10;

    updatedApp = await tx.application.update({
      where: { id: applicationId },
      data: {
        currentStageKey: nextStage,
        status: "IN_PROGRESS",
        assignedToId: nextOwner?.id,
        stageEnteredAt: now,
        updatedAt: now,
      },
    });

    await tx.applicationStage.create({
      data: {
        applicationId,
        stageKey: nextStage,
        enteredAt: now,
        enteredById: actor.id,
      },
    });

    // Auto-hooks
    if (nextStage === "EVC_QUEUE") {
      // Create EVC visit and EVC_SCHEDULING deadline
      const existingEvc = await tx.evcVisit.findUnique({ where: { applicationId } });
      if (!existingEvc) {
        await tx.evcVisit.create({
          data: {
            applicationId,
            status: "QUEUED",
            queuedAt: now,
            isNewInstitution: app.applicationType === "NEW_INSTITUTION",
          },
        });
      }

      const evcQueueDays = stageConfigs.EVC_QUEUE?.timelineDays ?? 5;
      await tx.deadlineItem.create({
        data: {
          kind: "EVC_SCHEDULING",
          refType: "Application",
          refId: applicationId,
          institutionId: app.institutionId,
          regionId: app.regionId,
          ownerUserId: nextOwner?.id,
          title: `${app.refNo} – EVC Scheduling deadline`,
          dueAt: new Date(now.getTime() + evcQueueDays * 86400000),
          applicationId,
        },
      });
    }

    await tx.deadlineItem.create({
      data: {
        kind: "STAGE_TIMELINE",
        refType: "Application",
        refId: applicationId,
        institutionId: app.institutionId,
        regionId: app.regionId,
        ownerUserId: nextOwner?.id,
        title: `${app.refNo} – ${STAGES[nextStage]?.label ?? nextStage} deadline`,
        dueAt: new Date(now.getTime() + stageTimelineDays * 86400000),
        applicationId,
      },
    });
  });

  if (nextStage && assignedNextOwner) {
    const owner = assignedNextOwner as User;
    await notify({
      toUserId: owner.id,
      kind: "INFO",
      subject: `Application advanced: ${app.refNo}`,
      body: `Application ${app.refNo} has moved to ${STAGES[nextStage]?.label}. Please review.`,
      applicationId,
    });
  }

  await appendAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "STAGE_ADVANCED",
    entityType: "Application",
    entityId: applicationId,
    payload: { from: app.currentStageKey, to: nextStage, note },
  });

  return updatedApp!;
}

/**
 * Return an application with a reason (to institution for deficiency, or to prior stage internally).
 */
export async function returnApplication(
  applicationId: string,
  actor: User,
  reason: string,
  toStageKey?: string
): Promise<Application> {
  if (!reason || reason.trim().length < 10) {
    throw new Error("Return reason must be at least 10 characters");
  }

  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  if (!canReturnApplication(actor, app.currentStageKey)) {
    throw new AuthError(`Role ${actor.role} cannot return applications at ${app.currentStageKey}`, 403);
  }
  if (actor.role === "REGIONAL_OFFICER") {
    assertRegionAccess(actor, app.regionId);
  }
  if (toStageKey) {
    const routeStages = await getConfiguredRouteStages(app.route);
    const normalized = toStageKey === "RE_SCRUTINY" ? "SCRUTINY" : toStageKey;
    if (!routeStages.includes(normalized)) {
      throw new Error(`Invalid return stage ${toStageKey} for route ${app.route}`);
    }
  }
  const now = await getNow();

  const currentStageRecord = await prisma.applicationStage.findFirst({
    where: { applicationId, stageKey: app.currentStageKey, exitedAt: null },
    orderBy: { enteredAt: "desc" },
  });

  const openDeadline = await prisma.deadlineItem.findFirst({
    where: { refId: applicationId, refType: "Application", state: "OPEN", kind: "STAGE_TIMELINE" },
    orderBy: { openedAt: "desc" },
  });

  const institutionUser = await prisma.user.findFirst({
    where: { institutionId: app.institutionId },
  });

  // Response window
  let responseWindowDays = RESPONSE_WINDOW_DAYS;
  try {
    const rc = await prisma.ruleConfig.findUnique({ where: { key: "RESPONSE_WINDOW_DAYS" } });
    if (rc) responseWindowDays = Number(JSON.parse(rc.value)) || RESPONSE_WINDOW_DAYS;
  } catch {}

  const updatedApp = await runTx(async (tx) => {
    if (currentStageRecord) {
      await tx.applicationStage.update({
        where: { id: currentStageRecord.id },
        data: { exitedAt: now, outcome: "RETURNED" },
      });
    }

    if (openDeadline) {
      await tx.deadlineItem.update({
        where: { id: openDeadline.id },
        data: { state: "CANCELLED", closedAt: now },
      });
    }

    await tx.observation.create({
      data: {
        applicationId,
        stageKey: app.currentStageKey,
        authorId: actor.id,
        text: reason,
        kind: "DEFICIENCY",
      },
    });

    const returnStage = toStageKey ?? "RE_SCRUTINY";

    // Open a stage row for the institution response window (dual-clock / timeline integrity)
    await tx.applicationStage.create({
      data: {
        applicationId,
        stageKey: returnStage,
        enteredAt: now,
        enteredById: actor.id,
        notes: "Returned — awaiting institution response",
      },
    });

    const updated = await tx.application.update({
      where: { id: applicationId },
      data: {
        status: "RETURNED",
        currentStageKey: returnStage,
        stageEnteredAt: now,
        updatedAt: now,
      },
    });

    // Open response window deadline for institution
    await tx.deadlineItem.create({
      data: {
        kind: "STAGE_TIMELINE",
        refType: "Application",
        refId: applicationId,
        institutionId: app.institutionId,
        regionId: app.regionId,
        ownerUserId: institutionUser?.id,
        title: `${app.refNo} – Institution response deadline`,
        dueAt: new Date(now.getTime() + responseWindowDays * 86400000),
        applicationId,
      },
    });

    return updated;
  });

  await appendAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "RETURNED",
    entityType: "Application",
    entityId: applicationId,
    payload: { reason, toStageKey, fromStage: app.currentStageKey },
  });

  if (institutionUser) {
    await notify({
      toUserId: institutionUser.id,
      kind: "RETURN",
      subject: `Application returned: ${app.refNo}`,
      body: `Your application ${app.refNo} has been returned. Reason: ${reason}`,
      applicationId,
    });
  }

  return updatedApp;
}

/**
 * Adaptive route: refer application to SAC/SHC hearing (officer decision, not auto).
 * Switches route to one that includes SAC_SHC when needed, then opens SAC_SHC stage.
 */
export async function referToSacShc(
  applicationId: string,
  actor: User,
  reason: string
): Promise<Application> {
  if (!reason || reason.trim().length < 10) {
    throw new Error("Referral reason must be at least 10 characters");
  }

  if (
    actor.role !== "ADMIN" &&
    actor.role !== "REGIONAL_OFFICER" &&
    actor.role !== "BUREAU_OFFICER"
  ) {
    throw new AuthError(`Role ${actor.role} cannot refer to SAC/SHC`, 403);
  }

  const app = await prisma.application.findUniqueOrThrow({ where: { id: applicationId } });
  if (actor.role === "REGIONAL_OFFICER") {
    assertRegionAccess(actor, app.regionId);
  }

  if (app.status !== "IN_PROGRESS" && app.status !== "RETURNED") {
    throw new Error(`Cannot refer application in status ${app.status}`);
  }

  if (app.currentStageKey === "SAC_SHC") {
    throw new Error("Application is already at SAC/SHC");
  }

  if (app.currentStageKey === "DECISION_PENDING") {
    throw new Error("Cannot refer after decision stage");
  }

  const stages = await getConfiguredRouteStages(app.route);
  let newRoute = app.route;
  if (!stages.includes("SAC_SHC")) {
    // Keep EVC path when already past scrutiny; otherwise full hearing route
    const pastScrutiny = ["EVC_QUEUE", "EVC_SCHEDULED", "EVC_REPORT"].includes(app.currentStageKey);
    newRoute = pastScrutiny ? "EVC_SAC_SHC" : "SCRUTINY_EVC_SAC_SHC";
  }

  const now = await getNow();
  const sac = await prisma.user.findFirst({ where: { role: "SAC_SHC_MEMBER" } });
  const stageConfigs = await getConfiguredStages();
  const timelineDays = stageConfigs.SAC_SHC?.timelineDays ?? 10;

  const currentStageRecord = await prisma.applicationStage.findFirst({
    where: { applicationId, stageKey: app.currentStageKey, exitedAt: null },
    orderBy: { enteredAt: "desc" },
  });

  const openDeadline = await prisma.deadlineItem.findFirst({
    where: { refId: applicationId, refType: "Application", state: "OPEN", kind: "STAGE_TIMELINE" },
    orderBy: { openedAt: "desc" },
  });

  const updatedApp = await runTx(async (tx) => {
    if (currentStageRecord) {
      await tx.applicationStage.update({
        where: { id: currentStageRecord.id },
        data: { exitedAt: now, outcome: "REFERRED_SAC_SHC", notes: reason },
      });
    }

    if (openDeadline) {
      await tx.deadlineItem.update({
        where: { id: openDeadline.id },
        data: { state: "CANCELLED", closedAt: now },
      });
    }

    await tx.observation.create({
      data: {
        applicationId,
        stageKey: app.currentStageKey,
        authorId: actor.id,
        text: reason,
        kind: "OBSERVATION",
      },
    });

    await tx.applicationStage.create({
      data: {
        applicationId,
        stageKey: "SAC_SHC",
        enteredAt: now,
        enteredById: actor.id,
      },
    });

    const updated = await tx.application.update({
      where: { id: applicationId },
      data: {
        route: newRoute,
        status: "IN_PROGRESS",
        currentStageKey: "SAC_SHC",
        stageEnteredAt: now,
        assignedToId: sac?.id ?? null,
        updatedAt: now,
      },
    });

    await tx.deadlineItem.create({
      data: {
        kind: "STAGE_TIMELINE",
        refType: "Application",
        refId: applicationId,
        institutionId: app.institutionId,
        regionId: app.regionId,
        ownerUserId: sac?.id,
        title: `${app.refNo} – ${STAGES.SAC_SHC?.label ?? "SAC/SHC"} deadline`,
        dueAt: new Date(now.getTime() + timelineDays * 86400000),
        applicationId,
      },
    });

    return updated;
  });

  await appendAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "REFERRED_SAC_SHC",
    entityType: "Application",
    entityId: applicationId,
    payload: { reason, fromStage: app.currentStageKey, fromRoute: app.route, toRoute: newRoute },
  });

  if (sac) {
    await notify({
      toUserId: sac.id,
      kind: "INFO",
      subject: `Referred to SAC/SHC: ${app.refNo}`,
      body: `Application ${app.refNo} has been referred for hearing. Reason: ${reason}`,
      applicationId,
    });
  }

  return updatedApp;
}

/**
 * Schedule an EVC Visit and transition application to EVC_SCHEDULED
 */
export async function scheduleEvc(
  evcId: string,
  actor: User,
  data: { scheduledFor: Date; isNewInstitution?: boolean; committeeId?: string }
) {
  const evc = await prisma.evcVisit.findUniqueOrThrow({
    where: { id: evcId },
    include: { application: true },
  });
  if (actor.role !== "ADMIN" && actor.role !== "REGIONAL_OFFICER") {
    throw new AuthError("Only regional officers can schedule EVC visits", 403);
  }
  if (actor.role === "REGIONAL_OFFICER") {
    assertRegionAccess(actor, evc.application.regionId);
  }
  if (evc.status !== "QUEUED" || evc.application.currentStageKey !== "EVC_QUEUE") {
    throw new Error("Only a queued EVC visit at EVC Queue can be scheduled");
  }

  const now = await getNow();
  if (!(data.scheduledFor instanceof Date) || Number.isNaN(data.scheduledFor.getTime())) {
    throw new Error("A valid EVC schedule date is required");
  }
  if (data.scheduledFor.getTime() < now.getTime()) {
    throw new Error("EVC schedule date cannot be in the past");
  }
  if (data.committeeId) {
    const committee = await prisma.user.findUnique({ where: { id: data.committeeId } });
    if (!committee || committee.role !== "EVC_COMMITTEE") {
      throw new Error("Selected committee member is not an EVC Committee user");
    }
  }
  const isNew = data.isNewInstitution ?? evc.isNewInstitution;
  const [stageConfigs, evcNewDays] = await Promise.all([
    getConfiguredStages(),
    getConfiguredEvcNewDays(),
  ]);
  const completionDays = isNew ? evcNewDays : (stageConfigs.EVC_SCHEDULED?.timelineDays ?? 20);

  await runTx(async (tx) => {
    const queueStage = await tx.applicationStage.findFirst({
      where: { applicationId: evc.applicationId, stageKey: "EVC_QUEUE", exitedAt: null },
      orderBy: { enteredAt: "desc" },
    });
    if (queueStage) {
      await tx.applicationStage.update({
        where: { id: queueStage.id },
        data: { exitedAt: now, outcome: "ADVANCED", notes: "EVC visit scheduled" },
      });
    }

    await tx.evcVisit.update({
      where: { id: evcId },
      data: {
        status: "SCHEDULED",
        scheduledFor: data.scheduledFor,
        committeeId: data.committeeId,
        isNewInstitution: isNew,
      },
    });

    await tx.application.update({
      where: { id: evc.applicationId },
      data: {
        currentStageKey: "EVC_SCHEDULED",
        assignedToId: data.committeeId ?? evc.application.assignedToId,
        stageEnteredAt: now,
        updatedAt: now,
      },
    });

    await tx.applicationStage.create({
      data: {
        applicationId: evc.applicationId,
        stageKey: "EVC_SCHEDULED",
        enteredAt: now,
        enteredById: actor.id,
      },
    });

    // Close EVC_SCHEDULING and open EVC_QUEUE stage deadlines
    await tx.deadlineItem.updateMany({
      where: {
        refId: evc.applicationId,
        kind: { in: ["EVC_SCHEDULING", "STAGE_TIMELINE"] },
        state: "OPEN",
      },
      data: { state: "SATISFIED", closedAt: now },
    });

    // Open EVC_COMPLETION deadline
    await tx.deadlineItem.create({
      data: {
        kind: "EVC_COMPLETION",
        refType: "EvcVisit",
        refId: evc.id,
        institutionId: evc.application.institutionId,
        regionId: evc.application.regionId,
        ownerUserId: data.committeeId ?? actor.id,
        title: `${evc.application.refNo} – EVC Completion Deadline`,
        dueAt: new Date(now.getTime() + completionDays * 86400000),
        applicationId: evc.applicationId,
      },
    });
  });

  await appendAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "EVC_SCHEDULED",
    entityType: "EvcVisit",
    entityId: evcId,
    payload: { scheduledFor: data.scheduledFor, isNewInstitution: isNew },
  });

  return { success: true };
}

/**
 * Mark an EVC Visit completed and advance application to EVC_REPORT
 */
export async function completeEvc(
  evcId: string,
  actor: User,
  data: {
    reportRef: string;
    findingsSummary?: string;
    recommendation?: "SATISFACTORY" | "DEFICIENT" | "RECOMMEND_HEARING";
  }
) {
  const evc = await prisma.evcVisit.findUniqueOrThrow({
    where: { id: evcId },
    include: { application: true },
  });
  if (evc.status !== "SCHEDULED" || evc.application.currentStageKey !== "EVC_SCHEDULED") {
    throw new Error("Only a scheduled EVC visit can be completed");
  }
  if (!data.reportRef?.trim()) {
    throw new Error("A non-empty EVC report reference is required");
  }
  const findings = (data.findingsSummary ?? "").trim();
  if (findings.length < 20) {
    throw new Error("Inspection findings summary must be at least 20 characters");
  }
  const recommendation = data.recommendation ?? "SATISFACTORY";
  const allowedRec = ["SATISFACTORY", "DEFICIENT", "RECOMMEND_HEARING"] as const;
  if (!allowedRec.includes(recommendation)) {
    throw new Error("Invalid EVC recommendation");
  }
  assertEvcCommitteeAccess(actor, evc);

  const now = await getNow();
  const stageConfigs = await getConfiguredStages();
  const ro = await prisma.user.findFirst({
    where: { role: "REGIONAL_OFFICER", regionId: evc.application.regionId },
  });
  const reportNote = `Report ${data.reportRef.trim()} · ${recommendation}\n${findings}`;

  await runTx(async (tx) => {
    const scheduledStage = await tx.applicationStage.findFirst({
      where: { applicationId: evc.applicationId, stageKey: "EVC_SCHEDULED", exitedAt: null },
      orderBy: { enteredAt: "desc" },
    });
    if (scheduledStage) {
      await tx.applicationStage.update({
        where: { id: scheduledStage.id },
        data: { exitedAt: now, outcome: "ADVANCED", notes: reportNote },
      });
    }

    await tx.evcVisit.update({
      where: { id: evcId },
      data: {
        status: "COMPLETED",
        completedAt: now,
        reportRef: data.reportRef.trim(),
      },
    });

    // Close EVC_COMPLETION deadline (seeded with refId=applicationId or runtime refId=evcId)
    await tx.deadlineItem.updateMany({
      where: {
        OR: [{ refId: evcId }, { applicationId: evc.applicationId }],
        kind: { in: ["EVC_COMPLETION", "STAGE_TIMELINE"] },
        state: "OPEN",
      },
      data: { state: "SATISFIED", closedAt: now },
    });

    // Move application to EVC_REPORT
    await tx.application.update({
      where: { id: evc.applicationId },
      data: {
        currentStageKey: "EVC_REPORT",
        assignedToId: ro?.id ?? evc.application.assignedToId,
        stageEnteredAt: now,
        updatedAt: now,
      },
    });

    await tx.applicationStage.create({
      data: {
        applicationId: evc.applicationId,
        stageKey: "EVC_REPORT",
        enteredAt: now,
        enteredById: actor.id,
        notes: reportNote,
      },
    });

    await tx.observation.create({
      data: {
        applicationId: evc.applicationId,
        stageKey: "EVC_SCHEDULED",
        authorId: actor.id,
        text: reportNote,
        kind: "OBSERVATION",
      },
    });

    // Open EVC_REPORT deadline
    await tx.deadlineItem.create({
      data: {
        kind: "STAGE_TIMELINE",
        refType: "Application",
        refId: evc.applicationId,
        institutionId: evc.application.institutionId,
        regionId: evc.application.regionId,
        ownerUserId: ro?.id,
        title: `${evc.application.refNo} – EVC Report Review deadline`,
        dueAt: new Date(now.getTime() + (stageConfigs.EVC_REPORT?.timelineDays ?? 7) * 86400000),
        applicationId: evc.applicationId,
      },
    });
  });

  await appendAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "EVC_COMPLETED",
    entityType: "EvcVisit",
    entityId: evcId,
    payload: {
      reportRef: data.reportRef.trim(),
      recommendation,
      findingsLength: findings.length,
    },
  });

  return { success: true };
}

/**
 * Submit undertaking evidence (Institution)
 */
export async function submitUndertakingEvidence(
  undertakingId: string,
  actor: User,
  data: {
    fileName: string;
    filePath?: string;
    note?: string;
    mimeType?: string;
    sizeBytes?: number;
  }
) {
  const ut = await prisma.undertaking.findUniqueOrThrow({ where: { id: undertakingId } });
  if (actor.role !== "INSTITUTION" && actor.role !== "ADMIN") {
    throw new AuthError("Only the institution can submit undertaking evidence", 403);
  }
  assertInstitutionAccess(actor, ut.institutionId);
  const now = await getNow();
  const sizeBytes = Number.isFinite(data.sizeBytes) && (data.sizeBytes as number) > 0
    ? Math.floor(data.sizeBytes as number)
    : null;
  if (sizeBytes == null) {
    throw new Error("Evidence sizeBytes from upload is required");
  }

  await runTx(async (tx) => {
    await tx.evidence.create({
      data: {
        ownerType: "UNDERTAKING",
        ownerId: undertakingId,
        undertakingId,
        fileName: data.fileName,
        filePath: data.filePath ?? `/uploads/${data.fileName}`,
        mimeType: data.mimeType || "application/pdf",
        sizeBytes,
        uploadedById: actor.id,
        uploadedAt: now,
        note: data.note,
      },
    });

    await tx.undertaking.update({
      where: { id: undertakingId },
      data: { status: "SUBMITTED" },
    });
  });

  await appendAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "EVIDENCE_UPLOADED",
    entityType: "Undertaking",
    entityId: undertakingId,
    payload: { fileName: data.fileName },
  });

  return { success: true };
}

/**
 * Verify or reject undertaking (Officer)
 */
export async function verifyUndertaking(
  undertakingId: string,
  actor: User,
  data: { verified: boolean; remarks?: string }
) {
  const ut = await prisma.undertaking.findUniqueOrThrow({
    where: { id: undertakingId },
    include: { institution: { select: { regionId: true } } },
  });
  if (!["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"].includes(actor.role)) {
    throw new AuthError("Only officers can verify undertakings", 403);
  }
  if (actor.role === "REGIONAL_OFFICER") {
    assertRegionAccess(actor, ut.institution.regionId);
  }
  const now = await getNow();

  await runTx(async (tx) => {
    if (data.verified) {
      await tx.undertaking.update({
        where: { id: undertakingId },
        data: {
          status: "VERIFIED",
          verifiedById: actor.id,
          verifiedAt: now,
          remarks: data.remarks,
        },
      });

      // Close deadline item
      await tx.deadlineItem.updateMany({
        where: {
          undertakingId,
          state: "OPEN",
        },
        data: { state: "SATISFIED", closedAt: now },
      });
    } else {
      // Return to PENDING so the institution can re-submit and tick can re-OVERDUE
      await tx.undertaking.update({
        where: { id: undertakingId },
        data: {
          status: "PENDING",
          verifiedById: actor.id,
          verifiedAt: now,
          remarks: data.remarks ?? "Evidence rejected — resubmit within cure window",
        },
      });

      // Reopen / extend deadline with 7-day cure window
      const cureDue = new Date(now.getTime() + 7 * 86400000);
      const openUt = await tx.deadlineItem.findFirst({
        where: { undertakingId, state: "OPEN" },
      });
      if (openUt) {
        await tx.deadlineItem.update({
          where: { id: openUt.id },
          data: { dueAt: cureDue },
        });
      } else {
        await tx.deadlineItem.create({
          data: {
            kind: "UNDERTAKING",
            refType: "Undertaking",
            refId: undertakingId,
            institutionId: ut.institutionId,
            regionId: ut.institution.regionId,
            title: `Undertaking (cure): ${ut.title.slice(0, 40)}`,
            dueAt: cureDue,
            undertakingId,
            applicationId: ut.applicationId,
          },
        });
      }
    }
  });

  await appendAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: data.verified ? "UNDERTAKING_VERIFIED" : "UNDERTAKING_REJECTED",
    entityType: "Undertaking",
    entityId: undertakingId,
    payload: { verified: data.verified, remarks: data.remarks },
  });

  return { success: true };
}

/**
 * Submit document renewal (Institution)
 */
export async function submitDocumentRenewal(
  documentId: string,
  actor: User,
  data: {
    validFrom: Date;
    validUntil: Date;
    fileName: string;
    filePath?: string;
    mimeType?: string;
    sizeBytes?: number;
  }
) {
  const doc = await prisma.instDocument.findUniqueOrThrow({ where: { id: documentId } });
  if (actor.role !== "INSTITUTION" && actor.role !== "ADMIN") {
    throw new AuthError("Only the institution can submit document renewals", 403);
  }
  assertInstitutionAccess(actor, doc.institutionId);
  const now = await getNow();
  const sizeBytes = Number.isFinite(data.sizeBytes) && (data.sizeBytes as number) > 0
    ? Math.floor(data.sizeBytes as number)
    : null;
  if (sizeBytes == null) {
    throw new Error("Evidence sizeBytes from upload is required");
  }

  await runTx(async (tx) => {
    await tx.evidence.create({
      data: {
        ownerType: "DOCUMENT",
        ownerId: documentId,
        documentId,
        fileName: data.fileName,
        filePath: data.filePath ?? `/uploads/${data.fileName}`,
        mimeType: data.mimeType || "application/pdf",
        sizeBytes,
        uploadedById: actor.id,
        uploadedAt: now,
      },
    });

    await tx.instDocument.update({
      where: { id: documentId },
      data: {
        status: "RENEWAL_SUBMITTED",
        validFrom: data.validFrom,
        validUntil: data.validUntil,
      },
    });
  });

  await appendAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: "RENEWAL_SUBMITTED",
    entityType: "InstDocument",
    entityId: documentId,
    payload: { validUntil: data.validUntil, fileName: data.fileName },
  });

  return { success: true };
}

/**
 * Verify or reject document renewal (Officer)
 */
export async function verifyDocument(
  documentId: string,
  actor: User,
  data: { verified: boolean; remarks?: string }
) {
  const doc = await prisma.instDocument.findUniqueOrThrow({
    where: { id: documentId },
    include: { institution: { select: { regionId: true } } },
  });
  if (!["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"].includes(actor.role)) {
    throw new AuthError("Only officers can verify document renewals", 403);
  }
  if (actor.role === "REGIONAL_OFFICER") {
    assertRegionAccess(actor, doc.institution.regionId);
  }
  const now = await getNow();

  await runTx(async (tx) => {
    if (data.verified) {
      await tx.instDocument.update({
        where: { id: documentId },
        data: {
          status: "VALID",
          verifiedById: actor.id,
          verifiedAt: now,
          remarks: data.remarks,
        },
      });

      // Close old deadline
      await tx.deadlineItem.updateMany({
        where: { documentId, state: "OPEN" },
        data: { state: "SATISFIED", closedAt: now },
      });

      // Open new deadline for the new validUntil
      await tx.deadlineItem.create({
        data: {
          kind: "DOCUMENT_EXPIRY",
          refType: "InstDocument",
          refId: doc.id,
          institutionId: doc.institutionId,
          title: `${doc.title} expiry deadline`,
          dueAt: doc.validUntil,
          documentId: doc.id,
        },
      });
    } else {
      await tx.instDocument.update({
        where: { id: documentId },
        data: {
          status: "RENEWAL_REJECTED",
          verifiedById: actor.id,
          verifiedAt: now,
          remarks: data.remarks,
        },
      });
    }
  });

  await appendAudit({
    actorId: actor.id,
    actorRole: actor.role,
    action: data.verified ? "RENEWAL_VERIFIED" : "RENEWAL_REJECTED",
    entityType: "InstDocument",
    entityId: documentId,
    payload: { verified: data.verified, remarks: data.remarks },
  });

  return { success: true };
}
