import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "@/lib/auth";
import { appendAudit } from "@/lib/audit";
import { AccountSelector } from "./AccountSelector";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: { institution: { select: { name: true } }, region: { select: { name: true } } },
  });

  const roleCards = [
    {
      role: "INSTITUTION",
      tag: "Institution",
      label: "Institution Portal",
      desc: "File applications, respond to scrutiny deficiencies, and submit compliance undertakings.",
      badgeColor: "var(--accent-sage)",
    },
    {
      role: "REGIONAL_OFFICER",
      tag: "Regional Office",
      label: "Regional Officer",
      desc: "Verify APH norms, return deficient files, schedule EVC visits, and review undertakings.",
      badgeColor: "var(--highlighter-yellow)",
    },
    {
      role: "BUREAU_OFFICER",
      tag: "Central Bureau",
      label: "Bureau Officer",
      desc: "Monitor regional pendency, handle escalations, and record competent authority decisions.",
      badgeColor: "var(--accent-blue)",
    },
    {
      role: "EVC_COMMITTEE",
      tag: "Campus Inspection",
      label: "EVC Committee",
      desc: "Conduct assigned campus inspections and submit verification reports within SLA.",
      badgeColor: "#FEF3C7",
    },
    {
      role: "SAC_SHC_MEMBER",
      tag: "Appellate Hearing",
      label: "SAC / SHC Member",
      desc: "Review referred cases in the Standing Appellate / Hearing Committee and record recommendations.",
      badgeColor: "#E4EAFE",
    },
    {
      role: "ADMIN",
      tag: "Administration",
      label: "System Admin",
      desc: "Manage stage timelines, simulate calendar dates, and verify SHA-256 audit integrity.",
      badgeColor: "var(--accent-peach)",
    },
  ];

  async function switchUser(formData: FormData) {
    "use server";
    const userId = formData.get("userId") as string;
    if (!userId) return;
    const picked = await prisma.user.findUnique({ where: { id: userId } });
    if (!picked) return;
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, userId, { httpOnly: true, path: "/", sameSite: "lax" });
    await appendAudit({
      actorId: picked.id,
      actorRole: picked.role,
      action: "LOGIN_SWITCH",
      entityType: "User",
      entityId: picked.id,
      payload: { userId: picked.id, role: picked.role },
    });
    redirect("/dashboard");
  }

  const userOptions = users.map((u) => ({
    id: u.id,
    name: u.name.replace(/^Institution User\s*[–-]\s*/i, "").trim(),
    email: u.email,
    role: u.role,
    scope: u.institution?.name ?? u.region?.name ?? "Central HQ",
  }));

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <header
        style={{
          borderBottom: "1.5px solid var(--border)",
          background: "var(--card-bg)",
          padding: "16px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img
            src="/logo.png"
            alt="AICTE Logo"
            style={{
              width: 36,
              height: 36,
              objectFit: "contain",
              borderRadius: 8,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 20, fontWeight: 800, color: "var(--forest)", letterSpacing: "-0.03em" }}>
            AICTE Flow
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--forest-muted)", fontWeight: 600 }}>
            Approval Process Handbook (APH)
          </span>
          <span
            style={{
              fontSize: 11.5,
              fontFamily: "var(--font-mono)",
              background: "var(--highlighter-yellow)",
              color: "var(--forest)",
              border: "1px solid var(--forest)",
              padding: "4px 12px",
              borderRadius: "9999px",
              fontWeight: 700,
              letterSpacing: "0.02em",
            }}
          >
            Workflow Portal
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, maxWidth: 1160, width: "100%", margin: "0 auto", padding: "44px 24px 56px" }}>
        <div style={{ textAlign: "center", maxWidth: 780, margin: "0 auto 40px" }}>
          <div
            style={{
              display: "inline-block",
              background: "var(--accent-blue)",
              color: "var(--forest)",
              border: "1px solid var(--forest)",
              padding: "4px 14px",
              borderRadius: "9999px",
              fontSize: 11.5,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              marginBottom: 16,
            }}
          >
            SIH26262 · DEMO MODE
          </div>

          <div
            style={{
              textAlign: "left",
              maxWidth: 640,
              margin: "0 auto 20px",
              padding: "12px 16px",
              borderRadius: 14,
              background: "var(--highlighter-yellow-soft)",
              border: "1.5px solid var(--forest)",
              fontSize: 12.5,
              color: "var(--forest)",
              lineHeight: 1.5,
            }}
          >
            <strong style={{ fontWeight: 800 }}>Evaluation / demo environment.</strong> Role entry uses a
            cookie-based account switcher (no passwords). Email and SMS alerts are written to an in-app
            delivery log — they are not sent through NIC / SMTP gateways. Production path: Jan Parichay SSO
            and official notification relays (see README roadmap).
          </div>

          <h1
            style={{
              fontSize: "clamp(1.9rem, 3.6vw, 2.9rem)",
              fontWeight: 800,
              color: "var(--forest)",
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              marginBottom: 14,
            }}
          >
            Approval workflow routing,{" "}
            <span
              style={{
                position: "relative",
                display: "inline-block",
                padding: "0 10px",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "var(--highlighter-yellow)",
                  border: "1.5px solid var(--forest)",
                  borderRadius: "9999px",
                  transform: "rotate(-0.5deg)",
                  zIndex: 0,
                }}
              />
              <span style={{ position: "relative", zIndex: 1 }}>SLA tracking</span>
            </span>{" "}
            &amp; compliance monitoring.
          </h1>

          <p
            style={{
              fontSize: 15.5,
              color: "var(--forest-muted)",
              lineHeight: 1.55,
              maxWidth: 640,
              margin: "0 auto",
            }}
          >
            Stage routing across Scrutiny, EVC, and SAC/SHC with deadline alerts, undertaking verification, lease expiry tracking, and a hash-chained audit log.
          </p>
        </div>

        {/* Role Cards Grid */}
        <div style={{ marginBottom: 28 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <h2 style={{ fontSize: 16.5, fontWeight: 800, color: "var(--forest)", margin: 0 }}>
              Select Role Workspace
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(205px, 1fr))",
              gap: 16,
            }}
          >
            {roleCards.map((card) => {
              const matchedUser = users.find((u) => u.role === card.role);
              return (
                <form key={card.role} action={switchUser} style={{ display: "flex" }}>
                  <input type="hidden" name="userId" value={matchedUser?.id ?? ""} />
                  <button
                    type="submit"
                    className="card card-interactive"
                    style={{
                      width: "100%",
                      textAlign: "left",
                      cursor: "pointer",
                      padding: "20px 18px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          display: "inline-block",
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          fontWeight: 700,
                          background: card.badgeColor,
                          color: "var(--forest)",
                          border: "1px solid var(--forest)",
                          padding: "2px 10px",
                          borderRadius: "9999px",
                          marginBottom: 12,
                        }}
                      >
                        {card.tag}
                      </div>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: "var(--forest)",
                          marginBottom: 6,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {card.label}
                      </div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: "var(--forest-muted)",
                          lineHeight: 1.5,
                          marginBottom: 18,
                        }}
                      >
                        {card.desc}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: "8px 14px",
                        background: "var(--forest)",
                        color: "#FAF8F5",
                        borderRadius: "9999px",
                        fontSize: 12,
                        fontWeight: 700,
                        textAlign: "center",
                        marginTop: "auto",
                      }}
                    >
                      Enter Workspace &rarr;
                    </div>
                  </button>
                </form>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ padding: "18px 22px", borderRadius: 18 }}>
          <span style={{ fontWeight: 700, fontSize: 13.5, color: "var(--forest)", display: "block", marginBottom: 10 }}>
            Sign in as a specific account
          </span>
          <AccountSelector users={userOptions} switchUserAction={switchUser} />
          <p style={{ marginTop: 14, fontSize: 12.5, color: "var(--forest-muted)" }}>
            After entry, open <strong style={{ color: "var(--forest)" }}>Jury Demo</strong> in the sidebar for the
            SIH26262 golden path (DEMO-* dockets → tick → audit).
          </p>
        </div>
      </main>
    </div>
  );
}
