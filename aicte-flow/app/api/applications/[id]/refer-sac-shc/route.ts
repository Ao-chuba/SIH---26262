import { NextRequest, NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireRole } from "@/lib/auth";
import { referToSacShc } from "@/lib/workflow/workflow";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await requireRole(["REGIONAL_OFFICER", "BUREAU_OFFICER", "ADMIN"]);
    const { reason } = await request.json();
    const updated = await referToSacShc(id, user, reason);
    return NextResponse.json(updated);
  } catch (e: unknown) {
    if (e instanceof AuthError) return authErrorResponse(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 409 });
  }
}
