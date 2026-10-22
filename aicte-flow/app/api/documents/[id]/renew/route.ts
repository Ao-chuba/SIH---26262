import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { submitDocumentRenewal } from "@/lib/workflow/workflow";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["INSTITUTION", "ADMIN"]);
  const body = await request.json();
  await submitDocumentRenewal(id, user, {
    validFrom: new Date(body.validFrom ?? new Date()),
    validUntil: new Date(body.validUntil),
    fileName: body.fileName ?? "renewed_document.pdf",
  });
  return NextResponse.json({ success: true });
}
