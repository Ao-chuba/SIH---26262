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
  const channels: ("INAPP" | "EMAIL" | "SMS")[] = ["INAPP"];
  // Add simulated EMAIL for most kinds
  if (params.kind !== "INFO") channels.push("EMAIL");
  // Add SMS for urgent kinds
  if (["OVERDUE", "ESCALATION"].includes(params.kind)) channels.push("SMS");

  for (const channel of channels) {
    await prisma.notification.create({
      data: {
        toUserId: params.toUserId,
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
