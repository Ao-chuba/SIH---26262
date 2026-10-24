import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth().catch(() => null);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const evidence = await prisma.evidence.findUnique({
    where: { id },
    include: {
      undertaking: { include: { institution: { select: { regionId: true } } } },
      document: { include: { institution: { select: { regionId: true } } } },
    },
  });
  if (!evidence) return NextResponse.json({ error: "Evidence not found" }, { status: 404 });

  const institutionId = evidence.undertaking?.institutionId ?? evidence.document?.institutionId;
  const regionId =
    evidence.undertaking?.institution.regionId ?? evidence.document?.institution.regionId;
  const allowed =
    user.role === "ADMIN" ||
    user.role === "BUREAU_OFFICER" ||
    evidence.uploadedById === user.id ||
    (user.role === "INSTITUTION" && user.institutionId === institutionId) ||
    (user.role === "REGIONAL_OFFICER" && user.regionId === regionId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const uploadsRoot = path.resolve(process.cwd(), "uploads");
  const storedName = path.basename(evidence.filePath);
  const absolutePath = path.resolve(uploadsRoot, storedName);
  if (!absolutePath.startsWith(`${uploadsRoot}${path.sep}`)) {
    return NextResponse.json({ error: "Invalid evidence path" }, { status: 400 });
  }

  try {
    const body = await readFile(absolutePath);
    return new NextResponse(body, {
      headers: {
        "Content-Type": evidence.mimeType,
        "Content-Disposition": `attachment; filename="${evidence.fileName.replace(/["\r\n]/g, "_")}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Evidence file is unavailable" }, { status: 404 });
  }
}
