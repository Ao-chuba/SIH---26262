import { prisma } from "./db";
import nodemailer, { type Transporter } from "nodemailer";

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

export interface GatewayStatus {
  emailGateway: "RESEND_LIVE" | "SMTP_LIVE" | "ETHEREAL_SANDBOX" | "SIMULATED";
  smsGateway: "FAST2SMS_LIVE" | "TWILIO_LIVE" | "SIMULATED";
  emailConfigured: boolean;
  smsConfigured: boolean;
}

export function getGatewayStatus(): GatewayStatus {
  const emailGateway = process.env.RESEND_API_KEY
    ? "RESEND_LIVE"
    : process.env.SMTP_HOST
    ? "SMTP_LIVE"
    : "ETHEREAL_SANDBOX";

  const smsGateway = process.env.FAST2SMS_API_KEY
    ? "FAST2SMS_LIVE"
    : process.env.TWILIO_ACCOUNT_SID
    ? "TWILIO_LIVE"
    : "SIMULATED";

  return {
    emailGateway,
    smsGateway,
    emailConfigured: Boolean(process.env.RESEND_API_KEY || process.env.SMTP_HOST),
    smsConfigured: Boolean(process.env.FAST2SMS_API_KEY || process.env.TWILIO_ACCOUNT_SID),
  };
}

let cachedTransporter: Transporter | null = null;
let etherealInitInProgress: Promise<Transporter | null> | null = null;

async function getEtherealTransporter(): Promise<Transporter | null> {
  if (cachedTransporter) return cachedTransporter;
  if (etherealInitInProgress) return etherealInitInProgress;

  etherealInitInProgress = (async () => {
    try {
      const testAccount = await Promise.race([
        nodemailer.createTestAccount(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 2500)),
      ]);
      cachedTransporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      return cachedTransporter;
    } catch {
      return null;
    } finally {
      etherealInitInProgress = null;
    }
  })();

  return etherealInitInProgress;
}

function buildHtmlEmail(subject: string, body: string, kind: string): string {
  const badgeColor =
    kind === "ESCALATION" ? "#9d174d; background: #fce7f3" : kind === "OVERDUE" ? "#991b1b; background: #fee2e2" : "#92400e; background: #fef3c7";

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0dfd5; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: #183227; padding: 20px 24px; color: #fbfbf9;">
        <span style="font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: #a3b899; font-weight: 700;">AICTE Flow Regulatory Alert</span>
        <h2 style="margin: 6px 0 0; font-size: 20px; font-weight: 700; color: #ffffff;">${subject}</h2>
      </div>
      <div style="padding: 24px; color: #222525; line-height: 1.6; font-size: 14px;">
        <div style="display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; margin-bottom: 16px; color: ${badgeColor};">
          PRIORITY: ${kind}
        </div>
        <p style="margin: 0 0 16px;">${body}</p>
        <hr style="border: 0; border-top: 1px solid #e0dfd5; margin: 24px 0;" />
        <p style="margin: 0; font-size: 12px; color: #667069;">
          This is an official compliance notification dispatched from the AICTE Flow Approval &amp; Monitoring Engine.
        </p>
      </div>
    </div>
  `;
}

export async function dispatchEmail(
  toEmail: string,
  subject: string,
  body: string,
  kind: string,
  forceLive = false
): Promise<{ status: "DELIVERED" | "SENT_SANDBOX" | "SIMULATED" | "FAILED"; previewUrl?: string }> {
  const styledHtml = buildHtmlEmail(subject, body, kind);

  // 1. Resend API
  if (process.env.RESEND_API_KEY) {
    try {
      const fromAddr = process.env.EMAIL_FROM || "AICTE Flow <onboarding@resend.dev>";
      const res = await Promise.race([
        fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromAddr,
            to: toEmail,
            subject: `[AICTE Alert] ${subject}`,
            text: body,
            html: styledHtml,
          }),
        }),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000)),
      ]);
      if (res.ok) {
        const data = await res.json();
        return { status: "DELIVERED", previewUrl: `https://resend.com/emails/${data.id ?? ""}` };
      }
    } catch {}
  }

  // 2. SMTP Transporter
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587", 10),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      await Promise.race([
        transporter.sendMail({
          from: process.env.EMAIL_FROM || process.env.SMTP_USER,
          to: toEmail,
          subject: `[AICTE Alert] ${subject}`,
          text: body,
          html: styledHtml,
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000)),
      ]);
      return { status: "DELIVERED" };
    } catch {}
  }

  // 3. Ethereal Email Sandbox (Only for interactive tests or when forceLive is enabled)
  if (forceLive) {
    try {
      const ethereal = await getEtherealTransporter();
      if (ethereal) {
        const info = await Promise.race([
          ethereal.sendMail({
            from: '"AICTE Flow Compliance" <compliance@aicte-flow.gov.in>',
            to: toEmail,
            subject: `[AICTE Alert] ${subject}`,
            text: body,
            html: styledHtml,
          }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000)),
        ]);
        const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
        return { status: "SENT_SANDBOX", previewUrl };
      }
    } catch {}
  }

  // 4. Clean Simulated Dispatch
  return { status: "SIMULATED" };
}

export async function dispatchSMS(
  phone: string,
  subject: string,
  body: string
): Promise<{ status: "DELIVERED" | "SIMULATED" | "FAILED"; trackingRef?: string }> {
  const cleanPhone = phone.replace(/[^\d+]/g, "");

  // 1. Fast2SMS (India)
  if (process.env.FAST2SMS_API_KEY && cleanPhone) {
    try {
      const numbers = cleanPhone.replace("+91", "").trim();
      const res = await Promise.race([
        fetch("https://www.fast2sms.com/dev/bulkV2", {
          method: "POST",
          headers: {
            authorization: process.env.FAST2SMS_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            route: "q",
            message: `[AICTE Alert] ${subject}: ${body.slice(0, 100)}`,
            language: "english",
            flash: 0,
            numbers,
          }),
        }),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000)),
      ]);
      const data = await res.json();
      if (data.return) {
        return { status: "DELIVERED", trackingRef: data.request_id };
      }
    } catch {}
  }

  // 2. Twilio (Worldwide)
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    try {
      const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
      const bodyParams = new URLSearchParams({
        To: cleanPhone.startsWith("+") ? cleanPhone : `+91${cleanPhone}`,
        From: process.env.TWILIO_PHONE_NUMBER,
        Body: `[AICTE Alert] ${subject}: ${body.slice(0, 120)}`,
      });
      const res = await Promise.race([
        fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: bodyParams.toString(),
          }
        ),
        new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000)),
      ]);
      if (res.ok) {
        const data = await res.json();
        return { status: "DELIVERED", trackingRef: data.sid };
      }
    } catch {}
  }

  // 3. Simulated Fallback
  return { status: "SIMULATED" };
}

export async function notify(params: NotifyParams): Promise<void> {
  if (!params.toUserId && !params.toInstitutionId) return;

  let targetUserId = params.toUserId;
  let targetEmail = "";
  let targetPhone = "";

  if (targetUserId) {
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { email: true, institution: { select: { contactPhone: true } } },
    });
    if (user) {
      targetEmail = user.email;
      targetPhone = user.institution?.contactPhone ?? "";
    }
  }

  if (params.toInstitutionId) {
    const inst = await prisma.institution.findUnique({
      where: { id: params.toInstitutionId },
      select: { contactEmail: true, contactPhone: true, users: { select: { id: true } } },
    });
    if (inst) {
      if (!targetEmail) targetEmail = inst.contactEmail;
      if (!targetPhone) targetPhone = inst.contactPhone;
      if (!targetUserId && inst.users[0]) targetUserId = inst.users[0].id;
    }
  }

  const channels: ("INAPP" | "EMAIL" | "SMS")[] = params.channel ? [params.channel] : ["INAPP"];
  if (!params.channel) {
    if (params.kind !== "INFO") channels.push("EMAIL");
    if (["OVERDUE", "ESCALATION"].includes(params.kind)) channels.push("SMS");
  }

  for (const channel of channels) {
    let deliveryStatus: "DELIVERED" | "SENT_SANDBOX" | "SIMULATED" | "FAILED" = "DELIVERED";
    let previewUrl: string | undefined = undefined;

    if (channel === "EMAIL") {
      const emailRes = await dispatchEmail(
        targetEmail || "ro.demo@aicte-india.org",
        params.subject,
        params.body,
        params.kind,
        false
      );
      deliveryStatus = emailRes.status;
      previewUrl = emailRes.previewUrl;
    } else if (channel === "SMS") {
      const smsRes = await dispatchSMS(targetPhone || "+919999999999", params.subject, params.body);
      deliveryStatus = smsRes.status;
      previewUrl = smsRes.trackingRef;
    }

    await prisma.notification.create({
      data: {
        toUserId: targetUserId,
        toInstitutionId: params.toInstitutionId,
        channel,
        kind: params.kind,
        subject: params.subject,
        body: params.body,
        deliveryStatus,
        previewUrl,
        deadlineItemId: params.deadlineItemId,
        applicationId: params.applicationId,
      },
    });
  }
}

export async function sendCustomLiveAlert(params: {
  targetEmail?: string;
  targetPhone?: string;
  kind: "REMINDER" | "OVERDUE" | "ESCALATION" | "INFO" | "RETURN";
  subject: string;
  body: string;
  actorUserId?: string;
}): Promise<{
  emailResult?: { status: string; previewUrl?: string };
  smsResult?: { status: string; trackingRef?: string };
}> {
  const results: {
    emailResult?: { status: string; previewUrl?: string };
    smsResult?: { status: string; trackingRef?: string };
  } = {};

  if (params.targetEmail) {
    const emailRes = await dispatchEmail(params.targetEmail, params.subject, params.body, params.kind, true);
    results.emailResult = emailRes;

    await prisma.notification.create({
      data: {
        toUserId: params.actorUserId,
        channel: "EMAIL",
        kind: params.kind,
        subject: `[LIVE TEST] ${params.subject}`,
        body: `Dispatched to ${params.targetEmail}: ${params.body}`,
        deliveryStatus: emailRes.status,
        previewUrl: emailRes.previewUrl,
      },
    });
  }

  if (params.targetPhone) {
    const smsRes = await dispatchSMS(params.targetPhone, params.subject, params.body);
    results.smsResult = smsRes;

    await prisma.notification.create({
      data: {
        toUserId: params.actorUserId,
        channel: "SMS",
        kind: params.kind,
        subject: `[LIVE TEST] ${params.subject}`,
        body: `Dispatched to ${params.targetPhone}: ${params.body}`,
        deliveryStatus: smsRes.status,
        previewUrl: smsRes.trackingRef,
      },
    });
  }

  return results;
}
