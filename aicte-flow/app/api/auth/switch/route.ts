import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appendAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const { userId } = await request.json();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, userId, { httpOnly: true, path: "/", sameSite: "lax" });

  await appendAudit({
    actorId: userId,
    actorRole: user.role,
    action: "LOGIN_SWITCH",
    entityType: "User",
    entityId: userId,
    payload: { userId, role: user.role },
  });

  return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, role: user.role } });
}
