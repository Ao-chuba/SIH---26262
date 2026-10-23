"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Application = {
  id: string;
  refNo: string;
  currentStageKey: string;
  status: string;
  route: string;
};

type User = {
  role: string;
  id: string;
};

export function ActionPanel({ app, user }: { app: Application; user: User }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [showObserve, setShowObserve] = useState(false);
  const [obsText, setObsText] = useState("");
  const [obsKind, setObsKind] = useState("OBSERVATION");
  const [showDecide, setShowDecide] = useState(false);
  const [decision, setDecision] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");

  const stageOwnerRoles: Record<string, string[]> = {
    SCRUTINY: ["REGIONAL_OFFICER", "ADMIN"],
    RE_SCRUTINY: ["REGIONAL_OFFICER", "ADMIN"],
    EVC_QUEUE: ["REGIONAL_OFFICER", "ADMIN"],
    EVC_SCHEDULED: ["EVC_COMMITTEE", "ADMIN"],
    EVC_REPORT: ["REGIONAL_OFFICER", "ADMIN"],
    SAC_SHC: ["SAC_SHC_MEMBER", "ADMIN"],
    DECISION_PENDING: ["BUREAU_OFFICER", "ADMIN"],
  };

  const canAdvance = stageOwnerRoles[app.currentStageKey]?.includes(user.role);
  const canReturn = canAdvance && app.currentStageKey !== "DECISION_PENDING";
  const canDecide = (user.role === "BUREAU_OFFICER" || user.role === "ADMIN") && app.currentStageKey === "DECISION_PENDING";
  const isInstitution = user.role === "INSTITUTION";

  async function doAdvance() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${app.id}/advance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: "Advanced by officer" }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setLoading(false); }
  }

  async function doReturn() {
    if (returnReason.trim().length < 10) { setError("Reason must be at least 10 characters"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${app.id}/return`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: returnReason }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setShowReturn(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setLoading(false); }
  }

  async function doObserve() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${app.id}/observe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: obsText, kind: obsKind }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setShowObserve(false);
      setObsText("");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setLoading(false); }
  }

  async function doDecide() {
    if (!decision || remarks.trim().length < 5) { setError("Decision and remarks are required"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${app.id}/decide`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, remarks }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setShowDecide(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setLoading(false); }
  }

  async function doReply(formData: FormData) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${app.id}/reply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: formData.get("text") as string }) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally { setLoading(false); }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title" style={{ marginBottom: 12 }}>Actions</div>
      {error && <div style={{ background: "#fee2e2", color: "#b91c1c", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>{error}</div>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {canAdvance && app.status === "IN_PROGRESS" && app.currentStageKey !== "DECISION_PENDING" && (
          <button className="btn btn-success" onClick={doAdvance} disabled={loading}>
            [+] Advance to Next Stage
          </button>
        )}
        {canReturn && (
          <button className="btn btn-secondary" onClick={() => setShowReturn(true)} disabled={loading}>
            [&lt;-] Return with Reason
          </button>
        )}
        {canDecide && (
          <button className="btn btn-primary" onClick={() => setShowDecide(true)} disabled={loading}>
            [!] Record Decision
          </button>
        )}
        <button className="btn btn-secondary" onClick={() => setShowObserve(true)} disabled={loading}>
          [+] Add Observation
        </button>
        {isInstitution && app.status === "RETURNED" && (
          <form onSubmit={(e) => { e.preventDefault(); doReply(new FormData(e.target as HTMLFormElement)); }} style={{ display: "flex", gap: 8, width: "100%", marginTop: 8 }}>
            <input name="text" className="form-input" placeholder="Type your reply / response..." required style={{ flex: 1 }} />
            <button type="submit" className="btn btn-primary" disabled={loading}>Submit Reply</button>
          </form>
        )}
      </div>

      {/* Return modal */}
      {showReturn && (
        <div className="modal-overlay" onClick={() => setShowReturn(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">[&lt;-] Return Application</div>
            <div style={{ background: "#fffbeb", border: "1px solid #fbbf24", padding: "10px 12px", borderRadius: 6, fontSize: 12, color: "#7c5c00", marginBottom: 16 }}>
              A reason is mandatory. This will be recorded in the audit trail and notified to the institution.
            </div>
            <div className="form-group">
              <label className="form-label">Reason for Return *</label>
              <textarea className="form-textarea" value={returnReason} onChange={(e) => setReturnReason(e.target.value)} placeholder="Describe the deficiency or reason for return (minimum 10 characters)..." style={{ minHeight: 100 }} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowReturn(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={doReturn} disabled={loading || returnReason.trim().length < 10}>Return Application</button>
            </div>
          </div>
        </div>
      )}

      {/* Observe modal */}
      {showObserve && (
        <div className="modal-overlay" onClick={() => setShowObserve(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">[+] Add Observation</div>
            <div className="form-group">
              <label className="form-label">Kind</label>
              <select className="form-select" value={obsKind} onChange={(e) => setObsKind(e.target.value)}>
                <option value="OBSERVATION">Observation</option>
                <option value="CLARIFICATION">Clarification</option>
                <option value="DEFICIENCY">Deficiency</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Text *</label>
              <textarea className="form-textarea" value={obsText} onChange={(e) => setObsText(e.target.value)} placeholder="Enter observation text..." />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowObserve(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={doObserve} disabled={loading}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Decide modal */}
      {showDecide && (
        <div className="modal-overlay" onClick={() => setShowDecide(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">[!] Record Decision</div>
            <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", padding: "10px 12px", borderRadius: 6, fontSize: 12, color: "#b91c1c", marginBottom: 16 }}>
              <strong>IMPORTANT:</strong> This is a human decision by the competent authority. The system does NOT auto-approve or auto-reject. This action will be permanently recorded in the audit trail.
            </div>
            <div className="form-group">
              <label className="form-label">Decision *</label>
              <select className="form-select" value={decision} onChange={(e) => setDecision(e.target.value)}>
                <option value="">Select decision...</option>
                <option value="APPROVED">Approved</option>
                <option value="APPROVED_WITH_CONDITIONS">Approved with Conditions</option>
                <option value="REJECTED">Rejected</option>
                <option value="DEFERRED">Deferred</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Remarks / Justification *</label>
              <textarea className="form-textarea" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Enter detailed remarks for this decision..." style={{ minHeight: 100 }} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowDecide(false)}>Cancel</button>
              <button className="btn btn-danger" onClick={doDecide} disabled={loading}>Record Decision</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
