import { NextRequest, NextResponse } from "next/server";
import { isDenied, requireRoleResponse } from "@/lib/auth";
import { submitUndertakingEvidence } from "@/lib/workflow/workflow";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRoleResponse(["INSTITUTION", "ADMIN"]);
  if (isDenied(user)) return user;
  const body = await request.json();
  await submitUndertakingEvidence(id, user, {
    fileName: body.fileName ?? "undertaking_compliance_evidence.pdf",
    note: body.note,
  });
  return NextResponse.json({ success: true });
}
