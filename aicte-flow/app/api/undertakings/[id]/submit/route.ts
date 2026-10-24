import { NextRequest, NextResponse } from "next/server";
import { isDenied, requireRoleResponse } from "@/lib/auth";
import { submitUndertakingEvidence } from "@/lib/workflow/workflow";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRoleResponse(["INSTITUTION", "ADMIN"]);
  if (isDenied(user)) return user;
  const body = await request.json();
  if (!body.filePath || !body.fileName || !body.sizeBytes) {
    return NextResponse.json(
      { error: "Upload the file first; fileName, filePath, and sizeBytes are required" },
      { status: 400 }
    );
  }
  try {
    await submitUndertakingEvidence(id, user, {
      fileName: body.fileName,
      filePath: body.filePath,
      mimeType: body.mimeType,
      sizeBytes: Number(body.sizeBytes),
      note: body.note,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Submit failed" },
      { status: 400 }
    );
  }
  return NextResponse.json({ success: true });
}
