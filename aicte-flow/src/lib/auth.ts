import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "./db";
import type { User, Region, Institution } from "@prisma/client";

export type Role =
  | "INSTITUTION"
  | "REGIONAL_OFFICER"
  | "BUREAU_OFFICER"
  | "EVC_COMMITTEE"
  | "SAC_SHC_MEMBER"
  | "ADMIN";

export type CurrentUser = User & {
  region: Region | null;
  institution: Institution | null;
};

export const COOKIE_NAME = "aicte_user_id";

/** Stage owners for direct stage advance (Bureau decides; RO schedules EVC via /evc; EVC completes via /evc). */
export const STAGE_ACTION_ROLES: Record<string, Role[]> = {
  SCRUTINY: ["REGIONAL_OFFICER", "ADMIN"],
  RE_SCRUTINY: ["REGIONAL_OFFICER", "ADMIN"],
  EVC_QUEUE: [], // must use scheduleEvc on /evc/[id] — no unscheduled advance
  EVC_SCHEDULED: [], // must use completeEvc on /evc/[id] — no free advance
  EVC_REPORT: ["REGIONAL_OFFICER", "ADMIN"],
  SAC_SHC: ["SAC_SHC_MEMBER", "ADMIN"],
  DECISION_PENDING: [], // must use decide — no free advance
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookieStore = await cookies();
  const userId = cookieStore.get(COOKIE_NAME)?.value;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    include: { region: true, institution: true },
  });
}

export async function requireRole(roles: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Not authenticated", 401);
  if (!roles.includes(user.role as Role))
    throw new AuthError(`Role ${user.role} not allowed. Required: ${roles.join(", ")}`, 403);
  return user;
}

export async function requireRoleResponse(roles: Role[]): Promise<CurrentUser | NextResponse> {
  try {
    return await requireRole(roles);
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }
}

export function isDenied(value: CurrentUser | NextResponse): value is NextResponse {
  return value instanceof Response;
}

export async function requireAuth(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError("Not authenticated", 401);
  return user;
}

export class AuthError extends Error {
  constructor(message: string, public readonly status: number = 403) {
    super(message);
    this.name = "AuthError";
  }
}

/** Can the user see / open this application docket? */
export function canViewApplication(
  user: User,
  app: { regionId: string; institutionId: string; currentStageKey?: string; assignedToId?: string | null },
  evcCommitteeId?: string | null
): boolean {
  if (user.role === "ADMIN" || user.role === "BUREAU_OFFICER") return true;
  if (user.role === "REGIONAL_OFFICER") return user.regionId === app.regionId;
  if (user.role === "INSTITUTION") return user.institutionId === app.institutionId;
  if (user.role === "EVC_COMMITTEE") {
    if (evcCommitteeId) return evcCommitteeId === user.id;
    return ["EVC_QUEUE", "EVC_SCHEDULED", "EVC_REPORT"].includes(app.currentStageKey ?? "");
  }
  if (user.role === "SAC_SHC_MEMBER") {
    // Keep docket visible after Advance (stage leaves SAC_SHC → DECISION_PENDING / DECIDED)
    return (
      app.currentStageKey === "SAC_SHC" ||
      app.currentStageKey === "DECISION_PENDING" ||
      app.assignedToId === user.id
    );
  }
  return false;
}

/** Can the user mutate the application case (advance/return/refer/observe)? */
export function canActOnApplication(
  user: User,
  app: { regionId: string; institutionId: string; currentStageKey?: string }
): boolean {
  if (user.role === "ADMIN") return true;
  if (user.role === "BUREAU_OFFICER") return true; // oversight: observe / refer / decide
  if (user.role === "REGIONAL_OFFICER") return user.regionId === app.regionId;
  if (user.role === "INSTITUTION") return user.institutionId === app.institutionId;
  if (user.role === "EVC_COMMITTEE") {
    return ["EVC_SCHEDULED", "EVC_REPORT"].includes(app.currentStageKey ?? "");
  }
  if (user.role === "SAC_SHC_MEMBER") return app.currentStageKey === "SAC_SHC";
  return false;
}

export function canAdvanceStage(user: User, stageKey: string): boolean {
  if (user.role === "ADMIN") return true;
  const roles = STAGE_ACTION_ROLES[stageKey] ?? [];
  return roles.includes(user.role as Role);
}

export function canReturnApplication(user: User, stageKey: string): boolean {
  if (stageKey === "DECISION_PENDING" || stageKey === "EVC_SCHEDULED" || stageKey === "EVC_QUEUE") return false;
  return canAdvanceStage(user, stageKey);
}

export function assertRegionAccess(user: User, regionId: string): void {
  if (user.role === "ADMIN" || user.role === "BUREAU_OFFICER") return;
  if (user.role === "REGIONAL_OFFICER" && user.regionId === regionId) return;
  throw new AuthError("Outside your regional jurisdiction", 403);
}

export function assertInstitutionAccess(user: User, institutionId: string): void {
  if (user.role === "ADMIN") return;
  if (user.role === "INSTITUTION" && user.institutionId === institutionId) return;
  throw new AuthError("Not your institution's record", 403);
}

export function assertEvcCommitteeAccess(
  user: User,
  evc: { committeeId: string | null; application: { regionId: string } }
): void {
  if (user.role === "ADMIN") return;
  if (user.role === "EVC_COMMITTEE") {
    if (!evc.committeeId) {
      throw new AuthError("This visit must be assigned before an EVC member can complete it", 403);
    }
    if (evc.committeeId && evc.committeeId !== user.id) {
      throw new AuthError("This visit is assigned to another EVC member", 403);
    }
    return;
  }
  throw new AuthError("Only the assigned EVC Committee member can submit the inspection report", 403);
}

export function authErrorResponse(e: unknown): NextResponse {
  if (e instanceof AuthError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "Forbidden" },
    { status: 403 }
  );
}
