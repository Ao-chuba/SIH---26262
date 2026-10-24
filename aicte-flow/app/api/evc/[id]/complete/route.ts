import { NextRequest, NextResponse } from "next/server";
import { isDenied, requireRoleResponse } from "@/lib/auth";
import { completeEvc } from "@/lib/workflow/workflow";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRoleResponse(["EVC_COMMITTEE", "ADMIN"]);
  if (isDenied(user)) return user;
  const body = await request.json();
  try {
    await completeEvc(id, user, {
      reportRef: body.reportRef,
      findingsSummary: body.findingsSummary,
      recommendation: body.recommendation,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to complete EVC visit" },
      { status: 400 }
    );
  }
}
