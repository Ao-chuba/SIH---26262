import { cookies } from "next/headers";
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

export function canActOnApplication(
  user: User,
  app: { regionId: string; institutionId: string }
): boolean {
  if (user.role === "ADMIN" || user.role === "BUREAU_OFFICER") return true;
  if (user.role === "REGIONAL_OFFICER") return user.regionId === app.regionId;
  if (user.role === "INSTITUTION") return user.institutionId === app.institutionId;
  if (user.role === "EVC_COMMITTEE" || user.role === "SAC_SHC_MEMBER") return true;
  return false;
}
