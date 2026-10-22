import { prisma } from "../db";
import { appendAudit } from "../audit";
import { getNow } from "../clock";
import { notify } from "../notify";
import { ROUTES, STAGES, APP_TYPE_ROUTE_MAP, EVC_NEW_INSTITUTION_DAYS } from "../../config/rules";
import type { User, Application } from "@prisma/client";

type RouteKey = keyof typeof ROUTES;

function getRouteStages(route: string): readonly string[] {
  return (ROUTES as Record<string, readonly string[]>)[route] ?? [];
}

function getNextStage(route: string, currentStage: string): string | null {
  const stages = getRouteStages(route);
  const idx = stages.indexOf(currentStage);
  if (idx === -1 || idx >= stages.length - 1) return null;
  return stages[idx + 1];
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
  const stages = ROUTES[route];
  const firstStage = stages[0];
  const now = await getNow();

  // Find an officer to assign (round-robin by lowest open count)
  const officers = await prisma.user.findMany({
    where: { role: STAGES[firstStage]?.ownerRole ?? "REGIONAL_OFFICER", regionId: app.regionId },
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

  const stageTimelineDays = STAGES[firstStage]?.timelineDays ?? 15;

  await prisma.$transaction(async (tx) => {
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

  // Guard: check actor role
  const stageOwnerRole = STAGES[app.currentStageKey]?.ownerRole;
  if (
    actor.role !== "ADMIN" &&
    actor.role !== "BUREAU_OFFICER" &&
    actor.role !== stageOwnerRole
  ) {
    throw new Error(`Role ${actor.role} cannot advance stage ${app.currentStageKey}`);
  }

  // Guard: illegal transition
  if (app.status !== "IN_PROGRESS" && app.status !== "RETURNED") {
    throw new Error(`Cannot advance application in status ${app.status}`);
  }

  const nextStage = getNextStage(app.route, app.currentStageKey);
  const now = await getNow();

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

  await prisma.$transaction(async (tx) => {
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
      // Already at last stage – should not happen, DECISION_PENDING is end
      updatedApp = await tx.application.update({
        where: { id: applicationId },
        data: { status: "COMPLETED", currentStageKey: app.currentStageKey, updatedAt: now },
      });
      return;
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

    const stageTimelineDays = STAGES[nextStage]?.timelineDays ?? 10;

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
      const isNew = app.institutionId ? false : true; // determine by application type
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

      await tx.deadlineItem.create({
        data: {
          kind: "EVC_SCHEDULING",
          refType: "Application",
          refId: applicationId,
          institutionId: app.institutionId,
          regionId: app.regionId,
          ownerUserId: nextOwner?.id,
          title: `${app.refNo} – EVC Scheduling deadline`,
          dueAt: new Date(now.getTime() + 5 * 86400000),
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

    if (nextOwner) {
      await notify({
        toUserId: nextOwner.id,
        kind: "INFO",
        subject: `Application advanced: ${app.refNo}`,
        body: `Application ${app.refNo} has moved to ${STAGES[nextStage]?.label}. Please review.`,
        applicationId,
      });
    }
  });

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
  const responseWindowDays = 7;

  const updatedApp = await prisma.$transaction(async (tx) => {
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

    const updated = await tx.application.update({
      where: { id: applicationId },
      data: {
        status: "RETURNED",
        currentStageKey: toStageKey ?? "RE_SCRUTINY",
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

  const now = await getNow();
  const isNew = data.isNewInstitution ?? evc.isNewInstitution;
  const completionDays = isNew ? EVC_NEW_INSTITUTION_DAYS : (STAGES.EVC_SCHEDULED?.timelineDays ?? 20);

  await prisma.$transaction(async (tx) => {
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

    // Close EVC_SCHEDULING deadline
    await tx.deadlineItem.updateMany({
      where: {
        refId: evc.applicationId,
        kind: "EVC_SCHEDULING",
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
  data: { reportRef: string }
) {
  const evc = await prisma.evcVisit.findUniqueOrThrow({
    where: { id: evcId },
    include: { application: true },
  });

  const now = await getNow();

  await prisma.$transaction(async (tx) => {
    await tx.evcVisit.update({
      where: { id: evcId },
      data: {
        status: "COMPLETED",
        completedAt: now,
        reportRef: data.reportRef,
      },
    });

    // Close EVC_COMPLETION deadline
    await tx.deadlineItem.updateMany({
      where: {
        refId: evcId,
        kind: "EVC_COMPLETION",
        state: "OPEN",
      },
      data: { state: "SATISFIED", closedAt: now },
    });

    // Move application to EVC_REPORT
    await tx.application.update({
      where: { id: evc.applicationId },
      data: {
        currentStageKey: "EVC_REPORT",
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
        notes: `Report submitted: ${data.reportRef}`,
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
        title: `${evc.application.refNo} – EVC Report Review deadline`,
        dueAt: new Date(now.getTime() + (STAGES.EVC_REPORT?.timelineDays ?? 7) * 86400000),
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
    payload: { reportRef: data.reportRef },
  });

  return { success: true };
}

/**
 * Submit undertaking evidence (Institution)
 */
export async function submitUndertakingEvidence(
  undertakingId: string,
  actor: User,
  data: { fileName: string; filePath?: string; note?: string }
) {
  const ut = await prisma.undertaking.findUniqueOrThrow({ where: { id: undertakingId } });
  const now = await getNow();

  await prisma.$transaction(async (tx) => {
    await tx.evidence.create({
      data: {
        ownerType: "UNDERTAKING",
        ownerId: undertakingId,
        undertakingId,
        fileName: data.fileName,
        filePath: data.filePath ?? `/uploads/${data.fileName}`,
        mimeType: "application/pdf",
        sizeBytes: 1024,
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
  const ut = await prisma.undertaking.findUniqueOrThrow({ where: { id: undertakingId } });
  const now = await getNow();

  await prisma.$transaction(async (tx) => {
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
      await tx.undertaking.update({
        where: { id: undertakingId },
        data: {
          status: "REJECTED",
          verifiedById: actor.id,
          verifiedAt: now,
          remarks: data.remarks,
        },
      });

      // Reopen deadline with 7-day cure window
      await tx.deadlineItem.updateMany({
        where: { undertakingId, state: "OPEN" },
        data: { dueAt: new Date(now.getTime() + 7 * 86400000) },
      });
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
  data: { validFrom: Date; validUntil: Date; fileName: string; filePath?: string }
) {
  const now = await getNow();

  await prisma.$transaction(async (tx) => {
    await tx.evidence.create({
      data: {
        ownerType: "DOCUMENT",
        ownerId: documentId,
        documentId,
        fileName: data.fileName,
        filePath: data.filePath ?? `/uploads/${data.fileName}`,
        mimeType: "application/pdf",
        sizeBytes: 1024,
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
  const doc = await prisma.instDocument.findUniqueOrThrow({ where: { id: documentId } });
  const now = await getNow();

  await prisma.$transaction(async (tx) => {
    if (data.verified) {
      await tx.instDocument.update({
        where: { id: documentId },
        data: {
          status: "VALID",
          verifiedById: actor.id,
          verifiedAt: now,
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
