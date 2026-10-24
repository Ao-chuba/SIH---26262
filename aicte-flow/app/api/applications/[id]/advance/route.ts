import { NextRequest, NextResponse } from "next/server";
import { AuthError, authErrorResponse, requireAuth } from "@/lib/auth";
import { advanceApplication } from "@/lib/workflow/workflow";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const user = await requireAuth();
    const body = await request.json().catch(() => ({}));
    const updated = await advanceApplication(id, user, body.note);
    return NextResponse.json(updated);
  } catch (e: unknown) {
    if (e instanceof AuthError) return authErrorResponse(e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 409 });
  }
}
