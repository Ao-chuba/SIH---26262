import { COOKIE_NAME, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatStage, formatStatus } from "@/lib/format";
import { cookies } from "next/headers";
import { appendAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const GOLDEN = [
  {
    step: 1,
    title: "Institution deficiency reply",
    account: "inst.1.apex@demo.aicte",
    refNo: "DEMO-INTAKE-004",
    hint: "Open the returned intake file → reply (≥10 chars) → resumes Re-Scrutiny.",
    roleHint: "INSTITUTION",
    switchTargets: [{ email: "inst.1.apex@demo.aicte", label: "Switch to Institution" }],
  },
  {
    step: 2,
    title: "Regional scrutiny → EVC queue",
    account: "ro.central.alpha@demo.aicte",
    refNo: "DEMO-NEW-INST-001",
    hint: "Advance scrutiny (or return with APH deficiency draft). Prefer Advance to place into EVC Queue.",
    roleHint: "REGIONAL_OFFICER",
    switchTargets: [{ email: "ro.central.alpha@demo.aicte", label: "Switch to RO" }],
  },
  {
    step: 3,
    title: "EVC schedule + report",
    account: "ro.central.alpha@demo.aicte → evc.member1@demo.aicte",
    refNo: "DEMO-NEW-COURSE-002",
    hint: "RO schedules the queued visit, then EVC Member 1 submits the report reference.",
    roleHint: "REGIONAL_OFFICER → EVC_COMMITTEE",
    switchTargets: [
      { email: "ro.central.alpha@demo.aicte", label: "Switch to RO & schedule" },
      { email: "evc.member1@demo.aicte", label: "Switch to EVC & complete" },
    ],
  },
  {
    step: 4,
    title: "Bureau decision + undertaking",
    account: "bo.alpha@demo.aicte",
    refNo: "DEMO-EXTENSION-003",
    hint: "At Decision Pending → Approve with Conditions → creates undertaking deadline.",
    roleHint: "BUREAU_OFFICER",
    switchTargets: [{ email: "bo.alpha@demo.aicte", label: "Switch to Bureau" }],
  },
  {
    step: 5,
    title: "Clock + tick → escalations",
    account: "admin@demo.aicte",
    refNo: null,
    hint: "Admin → advance simulated clock past due dates → Run tick → open Escalations & Notifications delivery log.",
    roleHint: "ADMIN",
    switchTargets: [{ email: "admin@demo.aicte", label: "Switch to Admin" }],
    links: [
      { href: "/admin?tab=clock", label: "Admin clock / tick" },
      { href: "/escalations", label: "Escalations" },
      { href: "/notifications", label: "Notifications" },
    ],
  },
  {
    step: 6,
    title: "Audit chain verify (+ optional tamper demo)",
    account: "admin@demo.aicte",
    refNo: null,
    hint: "Open Audit Trail → Verify chain. Use tamper only to show detection, then repair.",
    roleHint: "ADMIN",
    switchTargets: [{ email: "admin@demo.aicte", label: "Switch to Admin" }],
    links: [{ href: "/audit", label: "Audit trail" }],
  },
] as const;

export default async function DemoPlaybookPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");

  const demos = await prisma.application.findMany({
    where: { refNo: { startsWith: "DEMO-" } },
    select: {
      id: true,
      refNo: true,
      currentStageKey: true,
      status: true,
      institution: { select: { name: true } },
      evcVisit: { select: { id: true } },
    },
  });
  const byRef = Object.fromEntries(demos.map((d) => [d.refNo, d]));

  async function switchToAndGo(userEmail: string, href: string) {
    "use server";
    const picked = await prisma.user.findUnique({ where: { email: userEmail } });
    if (!picked) throw new Error(`Seeded demo account not found: ${userEmail}`);
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, picked.id, { httpOnly: true, path: "/", sameSite: "lax" });
    await appendAudit({
      actorId: picked.id,
      actorRole: picked.role,
      action: "LOGIN_SWITCH",
      entityType: "User",
      entityId: picked.id,
      payload: { userId: picked.id, role: picked.role, source: "jury-demo" },
    });
    redirect(href.startsWith("/") && !href.startsWith("//") ? href : "/demo");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Jury Golden Path</h1>
          <p className="page-subtitle">
            SIH26262 · 6–7 minute script · use the topbar Switch control between roles
          </p>
        </div>
        <Link href="/admin?tab=clock" className="btn btn-secondary btn-sm">
          Admin clock &rarr;
        </Link>
      </div>

      <div
        className="card"
        style={{
          marginBottom: 18,
          background: "var(--highlighter-yellow-soft)",
          border: "1.5px solid var(--forest)",
        }}
      >
        <strong style={{ fontWeight: 800, color: "var(--forest)" }}>Demo mode reminder.</strong>
        <span style={{ display: "block", marginTop: 6, fontSize: 13, color: "var(--forest)" }}>
          Cookie role switch · Email/SMS appear in the Notifications delivery log only · Final decisions
          stay human (DECISION_PENDING → Bureau).
        </span>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="card-header">
          <span className="card-title">Seeded DEMO dockets</span>
          <span className="badge badge-gray">{demos.length} files</span>
        </div>
        {demos.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--forest-muted)" }}>
            No DEMO-* applications found. Admin → Reset database / run{" "}
            <code className="font-mono">npm run seed</code>.
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
              {demos.map((d) => (
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
        {GOLDEN.map((g) => {
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
                    Switch to: <span className="font-mono">{g.account}</span>
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
