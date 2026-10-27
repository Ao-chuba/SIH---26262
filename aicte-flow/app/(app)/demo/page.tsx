import { COOKIE_NAME, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatStage, formatStatus } from "@/lib/format";
import { cookies } from "next/headers";
import { appendAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Fallback if DEMO-INTAKE-004's institution login cannot be resolved from seed. */
const DEMO_INTAKE_INSTITUTION_EMAIL = "inst.sgsits@demo.aicte";

type GuideStep = {
  step: number;
  title: string;
  account: string;
  refNo: string | null;
  hint: string;
  roleHint: string;
  switchTargets: { email: string; label: string }[];
  links?: { href: string; label: string }[];
};

function buildSteps(intakeInstitutionEmail: string): GuideStep[] {
  return [
    {
      step: 1,
      title: "Institution deficiency reply",
      account: intakeInstitutionEmail,
      refNo: "DEMO-INTAKE-004",
      hint: "Open the returned intake file, submit a compliance reply, and resume Re-Scrutiny.",
      roleHint: "INSTITUTION",
      switchTargets: [{ email: intakeInstitutionEmail, label: "Open as Institution" }],
    },
    {
      step: 2,
      title: "Regional scrutiny to EVC queue",
      account: "ro.central.alpha@demo.aicte",
      refNo: "DEMO-NEW-INST-001",
      hint: "Complete scrutiny (or return with an APH deficiency note). Advance places the file in the EVC Queue.",
      roleHint: "REGIONAL_OFFICER",
      switchTargets: [{ email: "ro.central.alpha@demo.aicte", label: "Open as Regional Officer" }],
    },
    {
      step: 3,
      title: "EVC schedule and report",
      account: "ro.central.alpha@demo.aicte → evc.member1@demo.aicte",
      refNo: "DEMO-NEW-COURSE-002",
      hint: "Regional Officer schedules the queued visit; the assigned EVC member registers the inspection report.",
      roleHint: "REGIONAL_OFFICER → EVC_COMMITTEE",
      switchTargets: [
        { email: "ro.central.alpha@demo.aicte", label: "Schedule as Regional Officer" },
        { email: "evc.member1@demo.aicte", label: "Report as EVC Member" },
      ],
    },
    {
      step: 4,
      title: "Bureau decision and undertaking",
      account: "bo.alpha@demo.aicte",
      refNo: "DEMO-EXTENSION-003",
      hint: "At Decision Pending, record Approve with Conditions to create a time-bound undertaking.",
      roleHint: "BUREAU_OFFICER",
      switchTargets: [{ email: "bo.alpha@demo.aicte", label: "Open as Bureau Officer" }],
    },
    {
      step: 5,
      title: "Deadline engine and escalations",
      account: "admin@demo.aicte",
      refNo: null,
      hint: "In Admin, advance the system calendar past due dates, run the deadline engine, then review Escalations and Notifications.",
      roleHint: "ADMIN",
      switchTargets: [{ email: "admin@demo.aicte", label: "Open as Admin" }],
      links: [
        { href: "/admin?tab=clock", label: "System calendar" },
        { href: "/escalations", label: "Escalations" },
        { href: "/notifications", label: "Notifications" },
      ],
    },
    {
      step: 6,
      title: "Audit chain verification",
      account: "admin@demo.aicte",
      refNo: null,
      hint: "Open Audit Trail and verify the hash chain. Use the integrity test only to confirm detection, then restore.",
      roleHint: "ADMIN",
      switchTargets: [{ email: "admin@demo.aicte", label: "Open as Admin" }],
      links: [{ href: "/audit", label: "Audit trail" }],
    },
  ];
}

export default async function ProcessGuidePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "ADMIN") redirect("/dashboard");

  const samples = await prisma.application.findMany({
    where: { refNo: { startsWith: "DEMO-" } },
    select: {
      id: true,
      refNo: true,
      currentStageKey: true,
      status: true,
      institution: {
        select: {
          name: true,
          users: {
            where: { role: "INSTITUTION" },
            select: { email: true },
            take: 1,
          },
        },
      },
      evcVisit: { select: { id: true } },
    },
  });
  const byRef = Object.fromEntries(samples.map((d) => [d.refNo, d]));
  const intakeInstitutionEmail =
    byRef["DEMO-INTAKE-004"]?.institution.users[0]?.email ?? DEMO_INTAKE_INSTITUTION_EMAIL;
  const STEPS = buildSteps(intakeInstitutionEmail);

  async function switchToAndGo(userEmail: string, href: string) {
    "use server";
    const picked = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!picked) throw new Error(`Account not found: ${userEmail}`);
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, picked.id, { httpOnly: true, path: "/", sameSite: "lax" });
    await appendAudit({
      actorId: picked.id,
      actorRole: picked.role,
      action: "LOGIN_SWITCH",
      entityType: "User",
      entityId: picked.id,
      payload: { userId: picked.id, role: picked.role, source: "process-guide" },
    });
    redirect(href.startsWith("/") && !href.startsWith("//") ? href : "/demo");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Process Guide</h1>
          <p className="page-subtitle">
            End-to-end walkthrough of approval, inspection, decision, and compliance monitoring
          </p>
        </div>
        <Link href="/admin?tab=clock" className="btn btn-secondary btn-sm">
          System calendar &rarr;
        </Link>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header">
          <span className="card-title">Sample applications</span>
          <span className="badge badge-gray">{samples.length} files</span>
        </div>
        {samples.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--forest-muted)" }}>
            No sample applications found. Use Admin to reset sample data.
          </p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Institution</th>
                <th>Stage</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {samples.map((d) => (
                <tr key={d.id}>
                  <td className="font-mono">{d.refNo}</td>
                  <td>{d.institution.name}</td>
                  <td>
                    <span className="badge badge-blue">{formatStage(d.currentStageKey)}</span>
                  </td>
                  <td>
                    <span className="badge badge-gray">{formatStatus(d.status)}</span>
                  </td>
                  <td>
                    <Link href={`/applications/${d.id}`} className="btn btn-primary btn-sm">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 12 }}>
        {STEPS.map((g) => {
          const app = g.refNo ? byRef[g.refNo] : null;
          return (
            <li key={g.step} className="card" style={{ margin: 0 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div
                  className="font-mono"
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9999,
                    background: "var(--forest)",
                    color: "#FAF8F5",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {g.step}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "var(--forest)" }}>
                      {g.title}
                    </h2>
                    <span className="badge badge-blue">{g.roleHint}</span>
                  </div>
                  <p style={{ margin: "8px 0 4px", fontSize: 13.5, color: "var(--forest)" }}>{g.hint}</p>
                  <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--forest-muted)" }}>
                    Account: <span className="font-mono">{g.account}</span>
                    {g.refNo ? (
                      <>
                        {" "}
                        · File: <span className="font-mono">{g.refNo}</span>
                      </>
                    ) : null}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {g.switchTargets.map((target) => {
                      const href = app
                        ? g.step === 3 && app.evcVisit
                          ? `/evc/${app.evcVisit.id}`
                          : `/applications/${app.id}`
                        : "links" in g && g.links?.[0]
                          ? g.links[0].href
                          : "/demo";
                      return (
                        <form key={target.email} action={switchToAndGo.bind(null, target.email, href)}>
                          <button type="submit" className="btn btn-primary btn-sm">
                            {target.label} &rarr;
                          </button>
                        </form>
                      );
                    })}
                    {app && (
                      <Link href={`/applications/${app.id}`} className="btn btn-secondary btn-sm">
                        Open {g.refNo}
                      </Link>
                    )}
                    {"links" in g &&
                      g.links?.map((l) => (
                        <Link key={l.href} href={l.href} className="btn btn-secondary btn-sm">
                          {l.label}
                        </Link>
                      ))}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
