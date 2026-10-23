import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: { institution: { select: { name: true } }, region: { select: { name: true } } },
  });

  const roleCards = [
    {
      role: "INSTITUTION",
      asciiTag: "[INSTITUTION]",
      label: "Institution Portal",
      desc: "Submit applications, track live stage SLA, resolve queries & compliance undertakings",
      badgeColor: "var(--accent-blue)",
    },
    {
      role: "REGIONAL_OFFICER",
      asciiTag: "[REGIONAL]",
      label: "Regional Officer",
      desc: "Scrutiny, deficiency checks, EVC queue management & institutional compliance verification",
      badgeColor: "var(--highlighter-yellow)",
    },
    {
      role: "BUREAU_OFFICER",
      asciiTag: "[BUREAU]",
      label: "Bureau Officer",
      desc: "All-region pendency oversight, SAC/SHC monitoring & final competent authority decisions",
      badgeColor: "var(--accent-blue)",
    },
    {
      role: "EVC_COMMITTEE",
      asciiTag: "[EVC]",
      label: "EVC Committee",
      desc: "Manage Expert Visit Committee inspections, schedule visits & upload inspection reports",
      badgeColor: "var(--accent-sage)",
    },
    {
      role: "ADMIN",
      asciiTag: "[ADMIN]",
      label: "System Admin",
      desc: "Simulated time engine, dynamic SLA rules, user directory & cryptographic audit ledger",
      badgeColor: "var(--accent-peach)",
    },
  ];

  async function switchUser(formData: FormData) {
    "use server";
    const userId = formData.get("userId") as string;
    if (!userId) return;
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, userId, { httpOnly: true, path: "/", sameSite: "lax" });
    redirect("/dashboard");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      {/* HeyFriends! Style Header */}
      <header
        style={{
          borderBottom: "1.5px solid var(--border)",
          background: "var(--card-bg)",
          padding: "16px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: 800,
              fontSize: 16,
              background: "var(--forest)",
              color: "var(--highlighter-yellow)",
              padding: "4px 10px",
              borderRadius: "9999px",
              letterSpacing: "0.05em",
            }}
          >
            [::]
          </span>
          <span style={{ fontSize: 22, fontWeight: 900, color: "var(--forest)", letterSpacing: "-0.03em" }}>
            AICTE Flow<span style={{ color: "var(--accent-blue)" }}>!</span>
          </span>
          <span
            style={{
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              background: "var(--accent-blue)",
              color: "var(--forest)",
              padding: "3px 10px",
              borderRadius: "9999px",
              fontWeight: 700,
              letterSpacing: "0.04em",
            }}
          >
            e-Governance
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 13, color: "var(--muted)", fontWeight: 500 }}>
            APH Workflow Automation System
          </span>
          <span
            style={{
              padding: "6px 16px",
              background: "var(--bg-subtle)",
              border: "1.5px solid var(--border)",
              color: "var(--forest)",
              borderRadius: "9999px",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
            }}
          >
            National Portal
          </span>
        </div>
      </header>

      {/* Hero Section */}
      <main style={{ flex: 1, maxWidth: 1180, width: "100%", margin: "0 auto", padding: "48px 24px" }}>
        <div style={{ textAlign: "center", maxWidth: 840, margin: "0 auto 48px" }}>
          <div
            style={{
              display: "inline-block",
              background: "var(--accent-blue)",
              color: "var(--forest)",
              padding: "6px 20px",
              borderRadius: "9999px",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: "var(--font-mono)",
              marginBottom: 20,
              letterSpacing: "0.04em",
            }}
          >
            AICTE APPROVAL WORKFLOW &amp; COMPLIANCE SYSTEM
          </div>

          <h1
            style={{
              fontSize: "clamp(2rem, 4vw, 3.25rem)",
              fontWeight: 900,
              color: "var(--forest)",
              lineHeight: 1.15,
              letterSpacing: "-0.035em",
              marginBottom: 20,
            }}
          >
            Unlock effortless{" "}
            <span
              style={{
                position: "relative",
                display: "inline-block",
                padding: "0 8px",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "var(--highlighter-yellow)",
                  borderRadius: "9999px",
                  transform: "rotate(-1deg)",
                  zIndex: 0,
                }}
              />
              <span style={{ position: "relative", zIndex: 1 }}>AICTE growth</span>
            </span>{" "}
            with end-to-end workflow clarity.
          </h1>

          <p
            style={{
              fontSize: 17,
              color: "var(--muted)",
              lineHeight: 1.6,
              maxWidth: 720,
              margin: "0 auto",
            }}
          >
            A modern, transparent compliance monitoring portal for institutions, regional offices, and central bureau.
            Features strict SLA countdowns, cryptographic audit ledger, and simulated time machine.
          </p>
        </div>

        {/* Role Cards Grid */}
        <div style={{ marginBottom: 40 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 20,
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "var(--forest)", margin: 0 }}>
              Select a Role to Enter Portal
            </h2>
            <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
              [SELECT ROLE]
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
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
                    className="card"
                    style={{
                      width: "100%",
                      textAlign: "left",
                      cursor: "pointer",
                      padding: "22px 18px",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                      border: "1.5px solid var(--border)",
                      borderRadius: 18,
                      background: "var(--card-bg)",
                      transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
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
                          padding: "3px 10px",
                          borderRadius: "9999px",
                          marginBottom: 14,
                        }}
                      >
                        {card.asciiTag}
                      </div>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: "var(--forest)",
                          marginBottom: 8,
                          letterSpacing: "-0.02em",
                        }}
                      >
                        {card.label}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--muted)",
                          lineHeight: 1.5,
                          marginBottom: 20,
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
                        fontFamily: "var(--font-mono)",
                        marginTop: "auto",
                      }}
                    >
                      Enter -&gt;
                    </div>
                  </button>
                </form>
              );
            })}
          </div>
        </div>



        {/* Specific User Quick Selector */}
        <div
          className="card"
          style={{
            padding: "24px 28px",
            background: "var(--card-bg)",
            borderRadius: 20,
            border: "1.5px solid var(--border)",
            marginBottom: 32,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <div>
              <span style={{ fontWeight: 800, fontSize: 15, color: "var(--forest)" }}>
                Or Launch Specific User Session
              </span>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)" }}>
                Pick from regional officers, institution coordinators, or bureau administrators
              </p>
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--muted)",
                background: "var(--bg-subtle)",
                padding: "3px 8px",
                borderRadius: "9999px",
              }}
            >
              [ACCOUNT SELECTOR]
            </span>
          </div>

          <form action={switchUser} style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <select
              name="userId"
              className="form-select"
              style={{
                flex: 1,
                minWidth: 280,
                borderRadius: "9999px",
                padding: "10px 18px",
                fontSize: 13,
                fontFamily: "var(--font-sans)",
                border: "1.5px solid var(--border)",
                background: "var(--card-bg)",
              }}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  [{u.role}] {u.name} — {u.email} ({u.institution?.name ?? u.region?.name ?? "Central"})
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="btn btn-primary"
              style={{
                borderRadius: "9999px",
                padding: "10px 24px",
                fontSize: 13,
                fontWeight: 700,
                fontFamily: "var(--font-mono)",
              }}
            >
              Launch Session -&gt;
            </button>
          </form>
        </div>

        {/* Official Statutory Notice Footer */}
        <div
          style={{
            padding: "16px 22px",
            background: "var(--card-bg)",
            borderRadius: 14,
            border: "1.5px solid var(--border)",
            fontSize: 12,
            color: "var(--muted)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 800, color: "var(--forest)" }}>
              [NOTICE]
            </span>
            <span>
              All approval workflows, stage SLAs, and inspections are administered pursuant to AICTE Approval Process Handbook (APH) statutory regulations.
            </span>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted)" }}>
            All India Council for Technical Education • New Delhi
          </span>
        </div>
      </main>
    </div>
  );
}
