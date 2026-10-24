import { NextRequest, NextResponse } from "next/server";
import { isDenied, requireRoleResponse } from "@/lib/auth";
import { submitDocumentRenewal } from "@/lib/workflow/workflow";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRoleResponse(["INSTITUTION", "ADMIN"]);
  if (isDenied(user)) return user;
  const body = await request.json();
  if (!body.filePath || !body.fileName || !body.sizeBytes || !body.validUntil) {
    return NextResponse.json(
      { error: "Upload the file first; fileName, filePath, sizeBytes, and validUntil are required" },
      { status: 400 }
    );
  }
  try {
    await submitDocumentRenewal(id, user, {
      validFrom: new Date(body.validFrom ?? new Date()),
      validUntil: new Date(body.validUntil),
      fileName: body.fileName,
      filePath: body.filePath,
      mimeType: body.mimeType,
      sizeBytes: Number(body.sizeBytes),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Renewal failed" },
      { status: 400 }
    );
  }
  return NextResponse.json({ success: true });
}
