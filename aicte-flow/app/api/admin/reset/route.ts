import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function POST() {
  const user = await requireRole(["ADMIN"]);
  try {
    await execAsync("npx tsx prisma/seed.ts");
    await appendAudit({
      actorId: user.id,
      actorRole: user.role,
      action: "SYSTEM_RESET",
      entityType: "System",
      entityId: "seed",
      payload: { resetBy: user.email },
    });
    return NextResponse.json({ success: true, message: "Demo data reset successfully" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
