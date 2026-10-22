"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type UserItem = {
  id: string;
  name: string;
  email: string;
  role: string;
  designation: string;
  region: string;
  escalatesTo: string;
};

type TickItem = {
  seq: number;
  ts: string;
  payload: string;
};

export function AdminControls({
  simulatedNow,
  currentDateIso,
  initialRules,
  users,
  recentTicks,
}: {
  simulatedNow: string | null;
  currentDateIso: string;
  initialRules: any;
  users: UserItem[];
  recentTicks: TickItem[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"clock" | "rules" | "users" | "ticks">("clock");
  const [targetDate, setTargetDate] = useState(currentDateIso.slice(0, 10));
  const [tickResult, setTickResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [rules, setRules] = useState(initialRules);
  const [rulesSaved, setRulesSaved] = useState(false);

  async function handleClockAction(action: "reset" | "addDays" | "set", days?: number) {
    setLoading(true);
    setTickResult(null);
    try {
      let body: any = {};
      if (action === "reset") body = { simulatedNow: null };
      else if (action === "addDays") body = { addDays: days };
      else if (action === "set") body = { simulatedNow: new Date(targetDate).toISOString() };

      const res = await fetch("/api/admin/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setTickResult(data);
      router.refresh();
    } catch {
      alert("Failed to update clock");
    } finally {
      setLoading(false);
    }
  }

  async function handleRunTick() {
    setLoading(true);
    setTickResult(null);
    try {
      const res = await fetch("/api/engine/tick", { method: "POST" });
      const data = await res.json();
      setTickResult(data);
      router.refresh();
    } catch {
      alert("Failed to run tick");
    } finally {
      setLoading(false);
    }
  }

  async function handleResetDemo() {
    if (!confirm("Are you sure you want to reset all demo data? This will reseed the database.")) return;
    setResetting(true);
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      const data = await res.json();
      alert(data.message ?? "Demo database reset completed!");
      router.refresh();
    } catch {
      alert("Failed to reset database");
    } finally {
      setResetting(false);
    }
  }

  async function handleSaveRules() {
    setLoading(true);
    try {
      await fetch("/api/admin/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "STAGES", value: rules.STAGES }),
      });
      await fetch("/api/admin/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "EVC_NEW_INSTITUTION_DAYS", value: rules.EVC_NEW_INSTITUTION_DAYS }),
      });
      setRulesSaved(true);
      setTimeout(() => setRulesSaved(false), 3000);
      router.refresh();
    } catch {
      alert("Failed to save rules");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Toast Notification of Tick Result */}
      {tickResult && (
        <div
          style={{
            marginBottom: 20,
            padding: "16px 20px",
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            borderRadius: 8,
            color: "#1e40af",
            boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong style={{ fontSize: 15 }}>⚡ Deadline Engine Tick Executed:</strong>
              <div style={{ marginTop: 6, display: "flex", gap: 16, fontSize: 13 }}>
                <span>🔔 Reminders Fired: <strong>{tickResult.remindersFired ?? 0}</strong></span>
                <span>🔴 Overdue Marked: <strong>{tickResult.overdueMarked ?? 0}</strong></span>
                <span>🔺 Escalations Raised: <strong>{tickResult.escalations ?? 0}</strong></span>
                <span>🕒 Simulated Now: <strong>{tickResult.tickedAt ? new Date(tickResult.tickedAt).toLocaleDateString() : new Date().toLocaleDateString()}</strong></span>
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setTickResult(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, borderBottom: "2px solid #e2e8f0", marginBottom: 20 }}>
        <button
          className={`btn ${activeTab === "clock" ? "btn-primary" : "btn-secondary"}`}
          style={{ borderRadius: "6px 6px 0 0", marginBottom: -2 }}
          onClick={() => setActiveTab("clock")}
        >
          🕒 Simulated Clock & Tick
        </button>
        <button
          className={`btn ${activeTab === "rules" ? "btn-primary" : "btn-secondary"}`}
          style={{ borderRadius: "6px 6px 0 0", marginBottom: -2 }}
          onClick={() => setActiveTab("rules")}
        >
          ⚙️ Rules & SLA Configuration
        </button>
        <button
          className={`btn ${activeTab === "users" ? "btn-primary" : "btn-secondary"}`}
          style={{ borderRadius: "6px 6px 0 0", marginBottom: -2 }}
          onClick={() => setActiveTab("users")}
        >
          👥 User Directory & Escalation Ladder
        </button>
        <button
          className={`btn ${activeTab === "ticks" ? "btn-primary" : "btn-secondary"}`}
          style={{ borderRadius: "6px 6px 0 0", marginBottom: -2 }}
          onClick={() => setActiveTab("ticks")}
        >
          📜 Engine Tick History
        </button>
      </div>

      {/* TAB 1: CLOCK */}
      {activeTab === "clock" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <div className="card">
            <div className="card-header"><span className="card-title">⏰ Simulated Date Control</span></div>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              Fast-forward simulated time to trigger automatic T-minus reminders, mark overdue transitions, and climb officer escalation ladders.
            </p>

            <div style={{ padding: "12px 16px", background: simulatedNow ? "#fef3c7" : "#ecfdf5", borderRadius: 6, marginBottom: 20 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: simulatedNow ? "#92400e" : "#065f46" }}>
                Current System Clock: {simulatedNow ? `🕒 Simulated (${new Date(simulatedNow).toLocaleDateString()})` : "🟢 Real Time"}
              </span>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 20 }}>
              <button disabled={loading} onClick={() => handleClockAction("addDays", 1)} className="btn btn-primary btn-sm">+1 Day</button>
              <button disabled={loading} onClick={() => handleClockAction("addDays", 7)} className="btn btn-primary btn-sm">+7 Days</button>
              <button disabled={loading} onClick={() => handleClockAction("addDays", 30)} className="btn btn-primary btn-sm">+30 Days</button>
              <button disabled={loading} onClick={() => handleClockAction("reset")} className="btn btn-secondary btn-sm">↺ Reset to Real Time</button>
            </div>

            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6 }}>Set Specific Date</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="date"
                  className="input-text"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  style={{ width: 180 }}
                />
                <button disabled={loading} onClick={() => handleClockAction("set")} className="btn btn-primary btn-sm">Set Date</button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><span className="card-title">⚙️ Engine Operations & Reset</span></div>
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ fontSize: 14, margin: "0 0 6px 0" }}>Manual Engine Tick</h4>
              <p style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
                Evaluate all open deadline items against current clock, fire pending alerts, send emails/SMS to notification delivery log, and advance escalations.
              </p>
              <button disabled={loading} onClick={handleRunTick} className="btn btn-primary">
                {loading ? "Running Tick..." : "⚡ Run Tick Now"}
              </button>
            </div>

            <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 16 }}>
              <h4 style={{ fontSize: 14, margin: "0 0 6px 0", color: "#dc2626" }}>Demo Data Reset</h4>
              <p style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
                Re-seeds SQLite database with all 8 AICTE regions, ~60 institutions, 200 applications across 5 routes, undertakings, and documents.
              </p>
              <button disabled={resetting} onClick={handleResetDemo} className="btn btn-danger">
                {resetting ? "Resetting Database..." : "⚠️ Reset Demo Data"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RULES */}
      {activeTab === "rules" && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Rules & SLA Timelines</span>
            {rulesSaved && <span style={{ color: "#16a34a", fontSize: 13, fontWeight: 600 }}>✅ Saved successfully!</span>}
          </div>

          <div style={{ padding: "12px 16px", background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 6, marginBottom: 20, fontSize: 13, color: "#92400e" }}>
            <strong>Regulatory Notice:</strong> The values below are illustrative placeholders. Configure in alignment with the official AICTE Approval Process Handbook (APH). All modifications are recorded in the tamper-evident audit trail.
          </div>

          <table className="data-table" style={{ marginBottom: 20 }}>
            <thead>
              <tr>
                <th>Workflow Stage</th>
                <th>Responsible Role</th>
                <th>SLA Timeline (Days)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(rules.STAGES).map(([key, stage]: [string, any]) => (
                <tr key={key}>
                  <td><strong>{stage.label}</strong> ({key})</td>
                  <td><span className="badge badge-blue">{stage.ownerRole}</span></td>
                  <td>
                    <input
                      type="number"
                      className="input-text"
                      style={{ width: 80 }}
                      value={stage.timelineDays}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        setRules({
                          ...rules,
                          STAGES: { ...rules.STAGES, [key]: { ...stage, timelineDays: val } },
                        });
                      }}
                    /> days
                  </td>
                </tr>
              ))}
              <tr>
                <td><strong>EVC New Institution SLA</strong></td>
                <td><span className="badge badge-red">EVC_COMMITTEE</span></td>
                <td>
                  <input
                    type="number"
                    className="input-text"
                    style={{ width: 80 }}
                    value={rules.EVC_NEW_INSTITUTION_DAYS}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 1;
                      setRules({ ...rules, EVC_NEW_INSTITUTION_DAYS: val });
                    }}
                  /> days
                </td>
              </tr>
            </tbody>
          </table>

          <button onClick={handleSaveRules} disabled={loading} className="btn btn-primary">
            {loading ? "Saving..." : "💾 Save Rule Configuration"}
          </button>
        </div>
      )}

      {/* TAB 3: USERS */}
      {activeTab === "users" && (
        <div className="card">
          <div className="card-header"><span className="card-title">User Directory & Escalation Hierarchy</span></div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Designation</th>
                <th>Region</th>
                <th>Escalates To</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong></td>
                  <td><code>{u.email}</code></td>
                  <td><span className="badge badge-blue">{u.role}</span></td>
                  <td>{u.designation || "—"}</td>
                  <td>{u.region}</td>
                  <td>
                    {u.escalatesTo !== "None" ? (
                      <span className="badge badge-amber">🔺 {u.escalatesTo}</span>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TAB 4: TICKS */}
      {activeTab === "ticks" && (
        <div className="card">
          <div className="card-header"><span className="card-title">Engine Execution Log (Last 20 Runs)</span></div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Seq</th>
                <th>Executed At</th>
                <th>Summary Payload</th>
              </tr>
            </thead>
            <tbody>
              {recentTicks.map((t) => (
                <tr key={t.seq}>
                  <td><strong>#{t.seq}</strong></td>
                  <td>{new Date(t.ts).toLocaleString()}</td>
                  <td>
                    <code style={{ fontSize: 12, background: "#f8fafc", padding: "4px 8px", borderRadius: 4 }}>
                      {t.payload}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
