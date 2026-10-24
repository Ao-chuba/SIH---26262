import { NextRequest, NextResponse } from "next/server";
import { isDenied, requireRoleResponse } from "@/lib/auth";
import { verifyDocument } from "@/lib/workflow/workflow";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRoleResponse(["REGIONAL_OFFICER", "ADMIN", "BUREAU_OFFICER"]);
  if (isDenied(user)) return user;
  let verified = true;
  let remarks = "";
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    verified = Boolean(body.verified);
    remarks = body.remarks ?? "";
  } else {
    const form = await request.formData();
    verified = form.get("verified") === "true";
    remarks = String(form.get("remarks") ?? "");
  }
  await verifyDocument(id, user, { verified, remarks });
  if (!contentType.includes("application/json")) {
    return NextResponse.redirect(new URL("/documents", request.url));
  }
  return NextResponse.json({ success: true });
}
