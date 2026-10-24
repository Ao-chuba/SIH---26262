import { prisma } from "./db";

export interface NotifyParams {
  toUserId?: string;
  toInstitutionId?: string;
  channel?: "INAPP" | "EMAIL" | "SMS";
  kind: "REMINDER" | "OVERDUE" | "ESCALATION" | "INFO" | "RETURN";
  subject: string;
  body: string;
  deadlineItemId?: string;
  applicationId?: string;
}

export async function notify(params: NotifyParams): Promise<void> {
  if (!params.toUserId && !params.toInstitutionId) return;

  let targetUserId = params.toUserId;
  if (!targetUserId && params.toInstitutionId) {
    const instUser = await prisma.user.findFirst({
      where: { institutionId: params.toInstitutionId },
      select: { id: true },
    });
    targetUserId = instUser?.id;
  }

  const channels: ("INAPP" | "EMAIL" | "SMS")[] = params.channel ? [params.channel] : ["INAPP"];
  if (!params.channel) {
    if (params.kind !== "INFO") channels.push("EMAIL");
    if (["OVERDUE", "ESCALATION"].includes(params.kind)) channels.push("SMS");
  }

  for (const channel of channels) {
    await prisma.notification.create({
      data: {
        toUserId: targetUserId,
        toInstitutionId: params.toInstitutionId,
        channel,
        kind: params.kind,
        subject: params.subject,
        body: params.body,
        deadlineItemId: params.deadlineItemId,
        applicationId: params.applicationId,
      },
    });
  }
}
