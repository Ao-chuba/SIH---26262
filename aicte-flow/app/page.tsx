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
    { role: "INSTITUTION", label: "Institution", icon: "🏫", desc: "Submit applications, track status, manage compliance", color: "#2a5298" },
    { role: "REGIONAL_OFFICER", label: "Regional Officer", icon: "👤", desc: "Process applications, schedule EVC, verify compliance", color: "#15803d" },
    { role: "BUREAU_OFFICER", label: "Bureau Officer", icon: "🏛️", desc: "All-region oversight, decisions, workload management", color: "#7c3aed" },
    { role: "EVC_COMMITTEE", label: "EVC Committee", icon: "🔍", desc: "Manage Expert Visit Committee queue and visits", color: "#b45309" },
    { role: "ADMIN", label: "Admin", icon: "⚙️", desc: "System configuration, clock control, audit & reports", color: "#b91c1c" },
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
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0f2040 0%, #1e3a5f 50%, #2a5298 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🎓</div>
        <h1 style={{ color: "#fff", fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>AICTE Flow</h1>
        <p style={{ color: "rgba(255,255,255,0.65)", fontSize: 14, marginTop: 6 }}>Approval Workflow Automation & Compliance Monitoring System</p>
        <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginTop: 4 }}>Problem Statement 26262 • SIH Demo</p>
      </div>

      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 32, width: "100%", maxWidth: 860, backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)" }}>
        <h2 style={{ color: "#fff", fontSize: 16, fontWeight: 600, marginBottom: 20, textAlign: "center" }}>Select Your Role to Continue</h2>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 32 }}>
          {roleCards.map((card) => (
            <form key={card.role} action={switchUser}>
              <input type="hidden" name="userId" value={users.find((u) => u.role === card.role)?.id ?? ""} />
              <button
                type="submit"
                className="role-card-btn"
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: 12,
                  padding: "16px 12px",
                  cursor: "pointer",
                  textAlign: "center",
                  transition: "all 0.2s",
                  color: "#fff",
                }}
              >
                <div style={{ fontSize: 28, marginBottom: 8 }}>{card.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{card.label}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>{card.desc}</div>
              </button>
            </form>
          ))}
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 24 }}>
          <h3 style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600, marginBottom: 12, textAlign: "center" }}>Or choose a specific user account:</h3>
          <form action={switchUser} style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <select name="userId" style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 13, cursor: "pointer", flex: 1, maxWidth: 360 }}>
              {users.map((u) => (
                <option key={u.id} value={u.id} style={{ background: "#1e3a5f", color: "#fff" }}>
                  [{u.role}] {u.name} — {u.email}
                </option>
              ))}
            </select>
            <button type="submit" style={{ background: "#2a5298", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>
              Enter →
            </button>
          </form>
        </div>
      </div>

      <div style={{ marginTop: 24, color: "rgba(255,255,255,0.4)", fontSize: 12, textAlign: "center", maxWidth: 600 }}>
        <strong>Demo system.</strong> All data is synthetic. Timelines are illustrative placeholders — configure per AICTE Approval Process Handbook.
      </div>
    </div>
  );
}
