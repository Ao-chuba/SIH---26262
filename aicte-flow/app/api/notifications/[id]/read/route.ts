import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getNow } from "@/lib/clock";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAuth();
  const now = await getNow();
  await prisma.notification.update({
    where: { id },
    data: { readAt: now },
  });
  return NextResponse.json({ success: true });
}
