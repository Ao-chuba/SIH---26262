import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { verifyAuditChain } from "@/lib/audit";

export async function GET(request: NextRequest) {
  const user = await requireRole(["ADMIN", "BUREAU_OFFICER", "REGIONAL_OFFICER"]).catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const result = await verifyAuditChain();
  return NextResponse.json(result);
}
