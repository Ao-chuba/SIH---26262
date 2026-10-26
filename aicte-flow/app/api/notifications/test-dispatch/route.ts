import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { sendCustomLiveAlert, getGatewayStatus } from "@/lib/notify";

export async function GET() {
  const status = getGatewayStatus();
  return NextResponse.json(status);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { targetEmail, targetPhone, kind, subject, message } = body;

    if (!targetEmail && !targetPhone) {
      return NextResponse.json(
        { error: "At least one recipient (email or phone) is required." },
        { status: 400 }
      );
    }

    const results = await sendCustomLiveAlert({
      targetEmail: targetEmail?.trim() || undefined,
      targetPhone: targetPhone?.trim() || undefined,
      kind: kind || "ESCALATION",
      subject: subject?.trim() || "AICTE Compliance Alert Notification",
      body: message?.trim() || "Immediate attention required: Scrutiny stage deadline nearing SLA breach.",
      actorUserId: user.id,
    });

    return NextResponse.json({
      success: true,
      message: "Notification dispatched successfully",
      results,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
