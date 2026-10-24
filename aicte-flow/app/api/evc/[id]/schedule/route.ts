import { NextRequest, NextResponse } from "next/server";
import { isDenied, requireRoleResponse } from "@/lib/auth";
import { scheduleEvc } from "@/lib/workflow/workflow";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRoleResponse(["REGIONAL_OFFICER", "ADMIN"]);
  if (isDenied(user)) return user;
  const body = await request.json();
  const scheduledFor = new Date(body.scheduledFor);
  try {
    await scheduleEvc(id, user, {
      scheduledFor,
      isNewInstitution: body.isNewInstitution,
      committeeId: body.committeeId,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to schedule EVC visit" },
      { status: 400 }
    );
  }
}
