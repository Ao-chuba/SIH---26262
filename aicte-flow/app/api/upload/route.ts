import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

export async function POST(request: NextRequest) {
  await requireAuth();
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File exceeds the 5 MB upload limit" }, { status: 413 });
    }
    const extension = path.extname(file.name).toLowerCase();
    const allowedExtensions = new Set([".pdf", ".png", ".jpg", ".jpeg"]);
    const allowedMimeTypes = new Set(["application/pdf", "image/png", "image/jpeg"]);
    if (!allowedExtensions.has(extension) || !allowedMimeTypes.has(file.type)) {
      return NextResponse.json({ error: "Only PDF, PNG, JPG, and JPEG files are allowed" }, { status: 415 });
    }

    const uploadsDir = path.join(process.cwd(), "uploads");
    await mkdir(uploadsDir, { recursive: true });

    const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const filePath = path.join(uploadsDir, safeName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filePath, buffer);

    return NextResponse.json({
      success: true,
      fileName: file.name,
      filePath: `/uploads/${safeName}`,
      sizeBytes: file.size,
      mimeType: file.type || "application/octet-stream",
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
