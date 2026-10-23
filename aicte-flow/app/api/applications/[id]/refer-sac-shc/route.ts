import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { referToSacShc } from "@/lib/workflow/workflow";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireAuth().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { reason } = await request.json();

  try {
    const updated = await referToSacShc(id, user, reason);
    return NextResponse.json(updated);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 409 });
  }
}
