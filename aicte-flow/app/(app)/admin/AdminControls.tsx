"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatRole } from "@/lib/format";

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
  initialTab = "clock",
  simulatedNow,
  currentDateIso,
  initialRules,
  users,
  recentTicks,
}: {
  initialTab?: "clock" | "rules" | "users" | "ticks";
  simulatedNow: string | null;
  currentDateIso: string;
  initialRules: any;
  users: UserItem[];
  recentTicks: TickItem[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"clock" | "rules" | "users" | "ticks">(initialTab);
  const [targetDate, setTargetDate] = useState(currentDateIso.slice(0, 10));
  const [tickResult, setTickResult] = useState<any | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [rules, setRules] = useState(initialRules);
  const [rulesSaved, setRulesSaved] = useState(false);

  async function handleClockAction(action: "reset" | "addDays" | "set", days?: number) {
    if (!window.confirm("Change the system calendar? This can trigger deadline and escalation changes.")) return;
    setLoading(true);
    setTickResult(null);
    setStatusMsg(null);
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
      if (!res.ok) throw new Error(data.error || "Failed to update clock");
      const summary = data.tick ?? data;
      setTickResult({
        remindersFired: summary.remindersFired ?? 0,
        overdueMarked: summary.overdueMarked ?? 0,
        escalations: summary.escalations ?? 0,
        tickedAt: summary.tickedAt ?? data.simulatedNow,
        simulatedNow: data.simulatedNow,
      });
      router.refresh();
    } catch (error) {
      setStatusMsg({ kind: "error", text: error instanceof Error ? error.message : "Failed to update clock." });
    } finally {
      setLoading(false);
    }
  }

  async function handleRunTick() {
    setLoading(true);
    setTickResult(null);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/engine/tick", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to run engine tick");
      setTickResult({
        remindersFired: data.remindersFired ?? 0,
        overdueMarked: data.overdueMarked ?? 0,
        escalations: data.escalations ?? 0,
        tickedAt: data.tickedAt,
      });
      router.refresh();
    } catch (error) {
      setStatusMsg({ kind: "error", text: error instanceof Error ? error.message : "Failed to run engine tick." });
    } finally {
      setLoading(false);
    }
  }

  async function handleResetDemo() {
    if (!window.confirm("Reset and reload sample data? Unsaved working changes will be lost.")) return;
    setResetting(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset database");
      setStatusMsg({ kind: "ok", text: data.message ?? "Database re-seeded." });
      router.refresh();
    } catch (error) {
      setStatusMsg({ kind: "error", text: error instanceof Error ? error.message : "Failed to reset database." });
    } finally {
      setResetting(false);
    }
  }

  async function handleSaveRules() {
    setLoading(true);
    setStatusMsg(null);
    try {
      const stagesResponse = await fetch("/api/admin/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "STAGES", value: rules.STAGES }),
      });
      const stagesData = await stagesResponse.json().catch(() => ({}));
      if (!stagesResponse.ok) throw new Error(stagesData.error || "Failed to save stage rules");
      const evcResponse = await fetch("/api/admin/rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "EVC_NEW_INSTITUTION_DAYS", value: rules.EVC_NEW_INSTITUTION_DAYS }),
      });
      const evcData = await evcResponse.json().catch(() => ({}));
      if (!evcResponse.ok) throw new Error(evcData.error || "Failed to save EVC rules");
      setRulesSaved(true);
      setTimeout(() => setRulesSaved(false), 3000);
      router.refresh();
    } catch (error) {
      setStatusMsg({ kind: "error", text: error instanceof Error ? error.message : "Failed to save rules." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {statusMsg && (
        <div
          style={{
            padding: "10px 14px",
            marginBottom: 14,
            borderRadius: 12,
            background: statusMsg.kind === "ok" ? "var(--green-bg)" : "var(--red-bg)",
            border: `1.5px solid ${statusMsg.kind === "ok" ? "var(--green-border)" : "var(--red-border)"}`,
            color: statusMsg.kind === "ok" ? "var(--green)" : "var(--red)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {statusMsg.text}
        </div>
      )}

      {tickResult && (
        <div className="card" style={{ marginBottom: 20, border: "1.5px solid var(--forest)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>Engine Tick Summary</div>
              <div className="grid-3">
                <Link
                  href="/notifications?tab=delivery"
                  style={{
                    textDecoration: "none",
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "var(--accent-blue)",
                    border: "1px solid var(--forest)",
                    color: "var(--forest)",
                  }}
                >
                  <div className="font-mono" style={{ fontSize: 22, fontWeight: 900 }}>{tickResult.remindersFired ?? 0}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>Reminders Fired &rarr;</div>
                </Link>
                <Link
                  href="/undertakings"
                  style={{
                    textDecoration: "none",
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "var(--red-bg)",
                    border: "1px solid var(--red-border)",
                    color: "var(--red)",
                  }}
                >
                  <div className="font-mono" style={{ fontSize: 22, fontWeight: 900 }}>{tickResult.overdueMarked ?? 0}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>Overdue Marked &rarr;</div>
                </Link>
                <Link
                  href="/escalations"
                  style={{
                    textDecoration: "none",
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "var(--purple-bg)",
                    border: "1px solid var(--purple-border)",
                    color: "var(--purple)",
                  }}
                >
                  <div className="font-mono" style={{ fontSize: 22, fontWeight: 900 }}>{tickResult.escalations ?? 0}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 2 }}>Escalations Raised &rarr;</div>
                </Link>
              </div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setTickResult(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="tabs">
        <button
          type="button"
          className={`tab ${activeTab === "clock" ? "active" : ""}`}
          onClick={() => setActiveTab("clock")}
        >
          Clock &amp; Tick
        </button>
        <button
          type="button"
          className={`tab ${activeTab === "rules" ? "active" : ""}`}
          onClick={() => setActiveTab("rules")}
        >
          SLA Rules
        </button>
        <button
          type="button"
          className={`tab ${activeTab === "users" ? "active" : ""}`}
          onClick={() => setActiveTab("users")}
        >
          User Directory
        </button>
        <button
          type="button"
          className={`tab ${activeTab === "ticks" ? "active" : ""}`}
          onClick={() => setActiveTab("ticks")}
        >
          Tick History
        </button>
      </div>

      {/* TAB 1: CLOCK */}
      {activeTab === "clock" && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <span className="card-title">System Calendar</span>
              <span className={`badge ${simulatedNow ? "badge-amber" : "badge-green"}`}>
                {simulatedNow
                  ? `Override: ${new Date(simulatedNow).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                  : "System Time"}
              </span>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
              <button disabled={loading} onClick={() => handleClockAction("addDays", 1)} className="btn btn-primary btn-sm">+1 Day</button>
              <button disabled={loading} onClick={() => handleClockAction("addDays", 7)} className="btn btn-primary btn-sm">+7 Days</button>
              <button disabled={loading} onClick={() => handleClockAction("addDays", 30)} className="btn btn-primary btn-sm">+30 Days</button>
              <button disabled={loading} onClick={() => handleClockAction("reset")} className="btn btn-secondary btn-sm">Reset Clock</button>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <label className="form-label">Set Specific Date</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="date"
                  className="form-input"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  style={{ maxWidth: 200 }}
                />
                <button disabled={loading} onClick={() => handleClockAction("set")} className="btn btn-primary btn-sm">
                  Apply
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Engine &amp; Database</span>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>Deadline Engine Tick</div>
              <p style={{ fontSize: 12.5, color: "var(--forest-muted)", marginBottom: 10 }}>
                Evaluates open deadlines against the current date, dispatches reminders, and updates escalations.
              </p>
              <button disabled={loading} onClick={handleRunTick} className="btn btn-primary btn-sm">
                {loading ? "Running..." : "Run Tick Now"}
              </button>
            </div>

            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, color: "var(--red)", marginBottom: 6 }}>Reset Sample Data</div>
              <p style={{ fontSize: 12.5, color: "var(--forest-muted)", marginBottom: 10 }}>
                Reloads regions, institutions, applications, undertakings, and documents.
              </p>
              <button disabled={resetting} onClick={handleResetDemo} className="btn btn-danger btn-sm">
                {resetting ? "Resetting..." : "Reset Sample Data"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RULES */}
      {activeTab === "rules" && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Stage SLA Timelines</span>
            {rulesSaved && <span className="badge badge-green">Saved</span>}
          </div>

          <div
            style={{
              padding: "10px 14px",
              background: "var(--amber-bg)",
              border: "1px solid var(--amber-border)",
              borderRadius: 10,
              marginBottom: 16,
              fontSize: 12.5,
              color: "var(--amber)",
            }}
          >
            Stage timelines and EVC SLA limits are stored in RuleConfig and logged to the audit ledger when updated.
          </div>

          <table className="data-table" style={{ marginBottom: 20 }}>
            <thead>
              <tr>
                <th>Stage</th>
                <th>Owner Role</th>
                <th>Timeline (Days)</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(rules.STAGES).map(([key, stage]: [string, any]) => (
                <tr key={key}>
                  <td>
                    <strong>{stage.label}</strong>
                  </td>
                  <td><span className="badge badge-blue">{formatRole(stage.ownerRole)}</span></td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="number"
                        className="form-input"
                        style={{ width: 90 }}
                        value={stage.timelineDays}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          setRules({
                            ...rules,
                            STAGES: { ...rules.STAGES, [key]: { ...stage, timelineDays: val } },
                          });
                        }}
                      />
                      <span style={{ fontSize: 12.5, color: "var(--forest-muted)" }}>days</span>
                    </div>
                  </td>
                </tr>
              ))}
              <tr>
                <td><strong>EVC New Institution SLA</strong></td>
                <td><span className="badge badge-red">EVC Committee</span></td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="number"
                      className="form-input"
                      style={{ width: 90 }}
                      value={rules.EVC_NEW_INSTITUTION_DAYS}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        setRules({ ...rules, EVC_NEW_INSTITUTION_DAYS: val });
                      }}
                    />
                    <span style={{ fontSize: 12.5, color: "var(--forest-muted)" }}>days</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <button onClick={handleSaveRules} disabled={loading} className="btn btn-primary">
            {loading ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      )}

      {/* TAB 3: USERS */}
      {activeTab === "users" && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Users &amp; Escalation Chain</span>
            <span className="badge badge-gray">{users.length}</span>
          </div>
          <div style={{ overflowX: "auto" }}>
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
                  <td><code style={{ fontSize: 12 }}>{u.email}</code></td>
                  <td><span className="badge badge-blue">{formatRole(u.role)}</span></td>
                  <td>{u.designation || "—"}</td>
                  <td>{u.region}</td>
                  <td>
                    {u.escalatesTo !== "None" ? (
                      <span className="badge badge-amber">{u.escalatesTo}</span>
                    ) : (
                      <span style={{ color: "var(--forest-light)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: TICKS */}
      {activeTab === "ticks" && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">Tick History</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Seq</th>
                  <th>Timestamp</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {recentTicks.map((t) => {
                  let parsed: { remindersFired?: number; overdueMarked?: number; escalations?: number } | null = null;
                  try {
                    parsed = JSON.parse(t.payload);
                  } catch {}
                  return (
                    <tr key={t.seq}>
                      <td className="font-mono"><strong>#{t.seq}</strong></td>
                      <td>{new Date(t.ts).toLocaleString()}</td>
                      <td>
                        {parsed ? (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span className="badge badge-blue">Reminders: {parsed.remindersFired ?? 0}</span>
                            <span className="badge badge-red">Overdue: {parsed.overdueMarked ?? 0}</span>
                            <span className="badge badge-purple">Escalations: {parsed.escalations ?? 0}</span>
                          </div>
                        ) : (
                          <code
                            style={{
                              fontSize: 12,
                              background: "var(--bg)",
                              border: "1px solid var(--border)",
                              padding: "4px 8px",
                              borderRadius: 8,
                            }}
                          >
                            {t.payload}
                          </code>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
