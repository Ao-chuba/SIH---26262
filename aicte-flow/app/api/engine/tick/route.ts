import { NextRequest, NextResponse } from "next/server";
import { tick } from "@/lib/engine/tick";
import { requireRole } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const user = await requireRole(["ADMIN"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    const summary = await tick();
    return NextResponse.json(summary);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Tick failed" }, { status: 500 });
  }
}
