import { NextResponse } from "next/server";
import { spawn } from "child_process";
import { cookies } from "next/headers";
import { COOKIE_NAME, isDenied, requireRoleResponse } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

function runSeed(): Promise<void> {
  return new Promise((resolve, reject) => {
    const keep = [
      "PATH",
      "Path",
      "PATHEXT",
      "SystemRoot",
      "windir",
      "COMSPEC",
      "USERPROFILE",
      "HOMEDRIVE",
      "HOMEPATH",
      "APPDATA",
      "LOCALAPPDATA",
      "TEMP",
      "TMP",
      "ProgramData",
      "PROGRAMFILES",
      "CommonProgramFiles",
    ];
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: process.env.NODE_ENV ?? "development",
    };
    for (const key of keep) {
      if (process.env[key]) env[key] = process.env[key];
    }

    const child = spawn("npx", ["tsx", "prisma/seed.ts"], {
      cwd: process.cwd(),
      env,
      shell: true,
      windowsHide: true,
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(output.slice(-1200) || `seed exited ${code}`));
    });
  });
}

export async function POST() {
  const user = await requireRoleResponse(["ADMIN"]);
  if (isDenied(user)) return user;

  try {
    const email = user.email;
    await runSeed();
    const fresh = await prisma.user.findUnique({ where: { email } });
    if (fresh) {
      const cookieStore = await cookies();
      cookieStore.set(COOKIE_NAME, fresh.id, { httpOnly: true, path: "/", sameSite: "lax" });
      await appendAudit({
        actorId: fresh.id,
        actorRole: fresh.role,
        action: "SYSTEM_RESET",
        entityType: "System",
        entityId: "seed",
        payload: { resetBy: email },
      });
    }
    return NextResponse.json({ success: true, message: "Sample data reset successfully" });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
