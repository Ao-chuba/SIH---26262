import { NextRequest, NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireAuth } from "@/lib/auth";
import { returnApplication } from "@/lib/workflow/workflow";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await requireAuth();
    const { reason, toStageKey } = await request.json();
    const updated = await returnApplication(id, user, reason, toStageKey);
    return NextResponse.json(updated);
  } catch (e: unknown) {
    if (e instanceof AuthError) return authErrorResponse(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 409 });
  }
}
