import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { scheduleEvc } from "@/lib/workflow/workflow";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["REGIONAL_OFFICER", "ADMIN"]);
  const body = await request.json();
  const scheduledFor = new Date(body.scheduledFor);
  await scheduleEvc(id, user, {
    scheduledFor,
    isNewInstitution: body.isNewInstitution,
    committeeId: body.committeeId,
  });
  return NextResponse.json({ success: true });
}
