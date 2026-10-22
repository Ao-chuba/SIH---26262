import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { advanceApplication } from "@/lib/workflow/workflow";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));

  try {
    const updated = await advanceApplication(id, user, body.note);
    return NextResponse.json(updated);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 409 });
  }
}
