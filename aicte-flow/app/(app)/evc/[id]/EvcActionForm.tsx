"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function EvcActionForm({
  evc,
  userRole,
  committeeMembers,
}: {
  evc: any;
  userRole: string;
  committeeMembers: { id: string; name: string; email: string }[];
}) {
  const router = useRouter();
  const [scheduledFor, setScheduledFor] = useState(
    evc.scheduledFor ? new Date(evc.scheduledFor).toISOString().slice(0, 10) : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  );
  const [committeeId, setCommitteeId] = useState(evc.committeeId ?? (committeeMembers[0]?.id || ""));
  const [isNewInstitution, setIsNewInstitution] = useState(evc.isNewInstitution);
  const [reportRef, setReportRef] = useState(evc.reportRef ?? `EVC-REPORT-${evc.application.refNo}`);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSchedule(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/evc/${evc.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledFor: new Date(scheduledFor).toISOString(),
          committeeId,
          isNewInstitution,
        }),
      });
      if (!res.ok) throw new Error("Failed to schedule EVC visit");
      router.push("/evc");
      router.refresh();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      setLoading(false);
    }
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/evc/${evc.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportRef }),
      });
      if (!res.ok) throw new Error("Failed to complete EVC visit");
      router.push("/evc");
      router.refresh();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Expert Visit Committee (EVC) Action</h1>
          <p className="page-subtitle">Application: {evc.application.refNo} • {evc.application.institution.name}</p>
        </div>
        <Link href="/evc" className="btn btn-secondary">&lt;- Back to EVC Queue</Link>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", color: "#dc2626", borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Case Overview */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header"><span className="card-title">Case Overview</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, fontSize: 13 }}>
          <div>
            <span style={{ color: "#64748b" }}>Institution Name:</span><br />
            <strong>{evc.application.institution.name}</strong>
          </div>
          <div>
            <span style={{ color: "#64748b" }}>Application Type:</span><br />
            <span className="badge badge-blue">{evc.application.applicationType}</span>
          </div>
          <div>
            <span style={{ color: "#64748b" }}>Current Status:</span><br />
            <span className="badge badge-amber">{evc.status}</span>
          </div>
          <div>
            <span style={{ color: "#64748b" }}>New Institution Flag:</span><br />
            {evc.isNewInstitution ? <span className="badge badge-red">New Institution (Strict 30d SLA)</span> : <span className="badge badge-gray">Existing</span>}
          </div>
        </div>
      </div>

      {/* Schedule Form */}
      {evc.status === "QUEUED" && (
        <form onSubmit={handleSchedule} className="card">
          <div className="card-header"><span className="card-title">[SCHEDULE] Schedule Physical / Virtual Inspection</span></div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Scheduled Inspection Date *</label>
            <input
              type="date"
              className="input-text"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              required
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Assign Committee Lead *</label>
            <select
              className="input-text"
              value={committeeId}
              onChange={(e) => setCommitteeId(e.target.value)}
              style={{ width: "100%" }}
            >
              {committeeMembers.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={isNewInstitution}
                onChange={(e) => setIsNewInstitution(e.target.checked)}
              />
              <strong>Classify as New Institution (Enforces 30-day visit completion deadline)</strong>
            </label>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "100%" }}>
            {loading ? "Scheduling..." : "[+] Confirm EVC Schedule & Advance to EVC_SCHEDULED"}
          </button>
        </form>
      )}

      {/* Complete Visit Form */}
      {evc.status === "SCHEDULED" && (
        <form onSubmit={handleComplete} className="card">
          <div className="card-header"><span className="card-title">[REPORT] Submit EVC Inspection Report</span></div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Report Reference Number / Upload Docket *</label>
            <input
              type="text"
              className="input-text"
              value={reportRef}
              onChange={(e) => setReportRef(e.target.value)}
              required
              style={{ width: "100%" }}
            />
          </div>

          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
            Submitting the report will automatically satisfy the inspection completion SLA and advance the application into the <strong>EVC_REPORT</strong> review queue.
          </p>

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "100%" }}>
            {loading ? "Submitting..." : "[>] Mark Completed & Advance to EVC Report Review"}
          </button>
        </form>
      )}

      {/* Completed State */}
      {evc.status === "COMPLETED" && (
        <div className="card" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
          <h3 style={{ margin: "0 0 8px 0", color: "#166534" }}>[OK] EVC Inspection Completed</h3>
          <p style={{ fontSize: 13, color: "#15803d", margin: "0 0 12px 0" }}>
            The committee report reference has been recorded as <strong>{evc.reportRef}</strong> on {evc.completedAt ? new Date(evc.completedAt).toLocaleDateString() : "recently"}.
          </p>
          <Link href={`/applications/${evc.applicationId}`} className="btn btn-primary btn-sm">
            View Application Stage Tracker
          </Link>
        </div>
      )}
    </div>
  );
}
