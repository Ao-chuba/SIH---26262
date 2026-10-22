import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { completeEvc } from "@/lib/workflow/workflow";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["EVC_COMMITTEE", "REGIONAL_OFFICER", "ADMIN"]);
  const body = await request.json();
  await completeEvc(id, user, { reportRef: body.reportRef ?? "EVC-REPORT-COMPLETED" });
  return NextResponse.json({ success: true });
}
