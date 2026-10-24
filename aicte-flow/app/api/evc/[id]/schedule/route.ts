import { NextRequest, NextResponse } from "next/server";
import { isDenied, requireRoleResponse } from "@/lib/auth";
import { scheduleEvc } from "@/lib/workflow/workflow";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRoleResponse(["REGIONAL_OFFICER", "ADMIN"]);
  if (isDenied(user)) return user;
  const body = await request.json();
  const scheduledFor = new Date(body.scheduledFor);
  await scheduleEvc(id, user, {
    scheduledFor,
    isNewInstitution: body.isNewInstitution,
    committeeId: body.committeeId,
  });
  return NextResponse.json({ success: true });
}
