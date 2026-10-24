"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

const STAGE_CUSTODIAN: Record<string, string> = {
  SCRUTINY: "Regional Officer (Initial Scrutiny)",
  RE_SCRUTINY: "Regional Officer (Re-Scrutiny)",
  EVC_QUEUE: "Regional Officer (EVC Scheduling)",
  EVC_SCHEDULED: "Assigned EVC Committee (Campus Inspection)",
  EVC_REPORT: "Regional Officer (EVC Report Review)",
  SAC_SHC: "Standing Appellate / Hearing Committee (SAC / SHC)",
  DECISION_PENDING: "Central Bureau (Competent Authority Decision)",
};

function apiError(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === "string") return error;
    if (typeof error === "object" && error !== null && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
  }
  return fallback;
}

export function ActionPanel({
  app,
  user,
  aphDeficiencyDraft = "",
  evcVisitId = null,
}: {
  app: Application;
  user: User;
  aphDeficiencyDraft?: string;
  evcVisitId?: string | null;
}) {
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
  const [condTitle, setCondTitle] = useState("Appoint required Ph.D. faculty per 1:20 norm");
  const [condText, setCondText] = useState("Submit compliance proof and appointment letters within 90 days.");
  const [condDays, setCondDays] = useState("90");
  const [showRefer, setShowRefer] = useState(false);
  const [referReason, setReferReason] = useState("");
  const [error, setError] = useState("");

  const stageOwnerRoles: Record<string, string[]> = {
    SCRUTINY: ["REGIONAL_OFFICER", "ADMIN"],
    RE_SCRUTINY: ["REGIONAL_OFFICER", "ADMIN"],
    EVC_QUEUE: [], // RO schedules via /evc/[id]
    EVC_SCHEDULED: [], // EVC submits report on /evc/[id]
    EVC_REPORT: ["REGIONAL_OFFICER", "ADMIN"],
    SAC_SHC: ["SAC_SHC_MEMBER", "ADMIN"],
    DECISION_PENDING: [], // Bureau uses Record Decision
  };

  const canAdvance = stageOwnerRoles[app.currentStageKey]?.includes(user.role);
  const canReturn =
    canAdvance &&
    app.currentStageKey !== "DECISION_PENDING" &&
    app.currentStageKey !== "EVC_QUEUE" &&
    app.currentStageKey !== "EVC_SCHEDULED";
  const canScheduleEvcHere =
    (user.role === "REGIONAL_OFFICER" || user.role === "ADMIN") &&
    app.currentStageKey === "EVC_QUEUE" &&
    app.status === "IN_PROGRESS" &&
    !!evcVisitId;
  const canSubmitEvcHere =
    (user.role === "EVC_COMMITTEE" || user.role === "ADMIN") &&
    app.currentStageKey === "EVC_SCHEDULED" &&
    app.status === "IN_PROGRESS" &&
    !!evcVisitId;
  const canDecide =
    (user.role === "BUREAU_OFFICER" || user.role === "ADMIN") &&
    app.currentStageKey === "DECISION_PENDING";
  const canRefer =
    (user.role === "REGIONAL_OFFICER" || user.role === "BUREAU_OFFICER" || user.role === "ADMIN") &&
    ["SCRUTINY", "RE_SCRUTINY", "EVC_QUEUE", "EVC_REPORT"].includes(app.currentStageKey) &&
    (app.status === "IN_PROGRESS" || app.status === "RETURNED");
  const canObserve = [
    "REGIONAL_OFFICER",
    "BUREAU_OFFICER",
    "EVC_COMMITTEE",
    "SAC_SHC_MEMBER",
    "ADMIN",
  ].includes(user.role);
  const isInstitution = user.role === "INSTITUTION";

  async function doAdvance() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${app.id}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Advanced by officer" }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(apiError(d, "Could not advance application"));
      }
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function doReturn() {
    if (returnReason.trim().length < 10) {
      setError("Reason must be at least 10 characters");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${app.id}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: returnReason }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(apiError(d, "Could not return application"));
      }
      setShowReturn(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function doObserve() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${app.id}/observe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: obsText, kind: obsKind }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(apiError(d, "Could not save observation"));
      }
      setShowObserve(false);
      setObsText("");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function doDecide() {
    if (!decision || remarks.trim().length < 5) {
      setError("Decision and remarks are required");
      return;
    }
    if (
      decision === "APPROVED_WITH_CONDITIONS" &&
      (!condTitle.trim() || !condText.trim())
    ) {
      setError("Undertaking title and condition are required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${app.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          remarks,
          undertaking:
            decision === "APPROVED_WITH_CONDITIONS"
              ? { title: condTitle, condition: condText, dueInDays: Number(condDays) || 90 }
              : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(apiError(d, "Could not record decision"));
      }
      setShowDecide(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function doRefer() {
    if (referReason.trim().length < 10) {
      setError("Referral reason must be at least 10 characters");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${app.id}/refer-sac-shc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: referReason }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(apiError(d, "Could not refer application"));
      }
      setShowRefer(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function doReply(formData: FormData) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/applications/${app.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: formData.get("text") as string }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(apiError(d, "Could not submit reply"));
      }
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  function openObserveWithAph() {
    if (aphDeficiencyDraft) {
      setObsKind("DEFICIENCY");
      setObsText(aphDeficiencyDraft);
    }
    setShowObserve(true);
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title" style={{ marginBottom: 12 }}>Actions</div>
      {error && (
        <div
          style={{
            background: "var(--red-bg)",
            border: "1px solid var(--red-border)",
            color: "var(--red)",
            padding: "8px 12px",
            borderRadius: 10,
            marginBottom: 12,
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {canAdvance && app.status === "IN_PROGRESS" && app.currentStageKey !== "DECISION_PENDING" && (
          <button className="btn btn-primary" onClick={doAdvance} disabled={loading}>
            Advance Stage &rarr;
          </button>
        )}
        {canScheduleEvcHere && (
          <Link href={`/evc/${evcVisitId}`} className="btn btn-primary">
            Schedule EVC Inspection &rarr;
          </Link>
        )}
        {canSubmitEvcHere && (
          <Link href={`/evc/${evcVisitId}`} className="btn btn-primary">
            Submit EVC Report &rarr;
          </Link>
        )}
        {canReturn && (
          <button className="btn btn-secondary" onClick={() => setShowReturn(true)} disabled={loading}>
            Return for Deficiency
          </button>
        )}
        {canRefer && (
          <button className="btn btn-secondary" onClick={() => setShowRefer(true)} disabled={loading}>
            Refer to SAC/SHC
          </button>
        )}
        {canDecide && (
          <button className="btn btn-primary" onClick={() => setShowDecide(true)} disabled={loading}>
            Record Decision
          </button>
        )}
        {canObserve && (
          <button className="btn btn-secondary" onClick={() => setShowObserve(true)} disabled={loading}>
            Add Observation
          </button>
        )}
        {aphDeficiencyDraft && canObserve && (user.role === "REGIONAL_OFFICER" || user.role === "ADMIN") && (
          <button className="btn btn-secondary" onClick={openObserveWithAph} disabled={loading}>
            Prefill APH Deficiencies
          </button>
        )}

        {app.status === "DECIDED" || app.status === "COMPLETED" ? (
          <div style={{ width: "100%", fontSize: 13, color: "var(--green)", fontWeight: 700, marginTop: 4 }}>
            Final decision recorded — workflow complete.
          </div>
        ) : isInstitution && app.status !== "RETURNED" ? (
          <div
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              fontSize: 13,
              color: "var(--forest-muted)",
            }}
          >
            Currently under review by{" "}
            <strong style={{ color: "var(--forest)" }}>
              {STAGE_CUSTODIAN[app.currentStageKey] ?? app.currentStageKey}
            </strong>
            . You will be notified if any deficiency response is required.
          </div>
        ) : !isInstitution && !canAdvance && !canScheduleEvcHere && !canSubmitEvcHere && !canDecide ? (
          <div
            style={{
              width: "100%",
              padding: "10px 14px",
              borderRadius: 10,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              fontSize: 12.5,
              color: "var(--forest-muted)",
              marginTop: 4,
            }}
          >
            Stage custodian:{" "}
            <strong style={{ color: "var(--forest)" }}>
              {STAGE_CUSTODIAN[app.currentStageKey] ?? app.currentStageKey}
            </strong>
            . Stage transition is restricted to the owning authority.
          </div>
        ) : null}

        {isInstitution && app.status === "RETURNED" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              doReply(new FormData(e.target as HTMLFormElement));
            }}
            style={{ display: "flex", gap: 8, width: "100%", marginTop: 8 }}
          >
            <input
              name="text"
              className="form-input"
              placeholder="Submit compliance reply to resume scrutiny..."
              required
              style={{ flex: 1 }}
            />
            <button type="submit" className="btn btn-primary" disabled={loading}>
              Submit Reply
            </button>
          </form>
        )}
      </div>

      {showReturn && (
        <div className="modal-overlay" onClick={() => setShowReturn(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Return Application</div>
            <p style={{ fontSize: 12.5, color: "var(--forest-muted)", marginBottom: 14 }}>
              Specify the deficiency reason (min 10 chars). Opens a 7-day response window for the institution.
            </p>
            <div className="form-group">
              <label className="form-label">Deficiency Reason *</label>
              <textarea
                className="form-textarea"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                placeholder="State the missing documents or norm shortfalls..."
                style={{ minHeight: 100 }}
              />
            </div>
            {aphDeficiencyDraft && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ marginBottom: 12 }}
                onClick={() => setReturnReason(aphDeficiencyDraft)}
              >
                Insert APH Deficiency Draft
              </button>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowReturn(false)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={doReturn}
                disabled={loading || returnReason.trim().length < 10}
              >
                Return Application
              </button>
            </div>
          </div>
        </div>
      )}

      {showRefer && (
        <div className="modal-overlay" onClick={() => setShowRefer(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Refer to SAC / SHC</div>
            <p style={{ fontSize: 12.5, color: "var(--forest-muted)", marginBottom: 14 }}>
              Routes the application to the Standing Appellate / Hearing Committee and logs the referral in the audit ledger.
            </p>
            <div className="form-group">
              <label className="form-label">Referral Reason *</label>
              <textarea
                className="form-textarea"
                value={referReason}
                onChange={(e) => setReferReason(e.target.value)}
                placeholder="Reason for committee hearing (min 10 characters)..."
                style={{ minHeight: 100 }}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowRefer(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={doRefer}
                disabled={loading || referReason.trim().length < 10}
              >
                Confirm Referral
              </button>
            </div>
          </div>
        </div>
      )}

      {showObserve && (
        <div className="modal-overlay" onClick={() => setShowObserve(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Add Observation</div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select className="form-select" value={obsKind} onChange={(e) => setObsKind(e.target.value)}>
                <option value="OBSERVATION">Observation</option>
                <option value="CLARIFICATION">Clarification</option>
                <option value="DEFICIENCY">Deficiency</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Notes *</label>
              <textarea
                className="form-textarea"
                value={obsText}
                onChange={(e) => setObsText(e.target.value)}
                placeholder="Enter scrutiny note..."
              />
            </div>
            {aphDeficiencyDraft && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ marginBottom: 12 }}
                onClick={() => {
                  setObsKind("DEFICIENCY");
                  setObsText(aphDeficiencyDraft);
                }}
              >
                Insert APH Deficiency Draft
              </button>
            )}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowObserve(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={doObserve} disabled={loading}>
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {showDecide && (
        <div className="modal-overlay" onClick={() => setShowDecide(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Record Authority Decision</div>
            <div
              style={{
                background: "var(--amber-bg)",
                border: "1px solid var(--amber-border)",
                padding: "10px 12px",
                borderRadius: 10,
                fontSize: 12,
                color: "var(--amber)",
                marginBottom: 14,
              }}
            >
              Human-in-the-loop requirement: final approval or rejection is recorded by an authorized Bureau Officer and logged to the SHA-256 ledger.
            </div>
            <div className="form-group">
              <label className="form-label">Decision *</label>
              <select className="form-select" value={decision} onChange={(e) => setDecision(e.target.value)}>
                <option value="">Select decision...</option>
                <option value="APPROVED">Approved</option>
                <option value="APPROVED_WITH_CONDITIONS">Approved with Conditions</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
            {decision === "APPROVED_WITH_CONDITIONS" && (
              <div style={{ padding: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 14 }}>
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label className="form-label">Undertaking Title *</label>
                  <input className="form-input" value={condTitle} onChange={(e) => setCondTitle(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 10 }}>
                  <label className="form-label">Condition Text *</label>
                  <input className="form-input" value={condText} onChange={(e) => setCondText(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Compliance Deadline (Days) *</label>
                  <input type="number" className="form-input" value={condDays} onChange={(e) => setCondDays(e.target.value)} style={{ maxWidth: 140 }} />
                </div>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Remarks / Order Justification *</label>
              <textarea
                className="form-textarea"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Enter justification for this decision..."
                style={{ minHeight: 100 }}
              />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowDecide(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={doDecide} disabled={loading}>
                Record Decision
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
