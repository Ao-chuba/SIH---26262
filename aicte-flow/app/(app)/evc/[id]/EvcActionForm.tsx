"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatAppType, formatStatus } from "@/lib/format";

export function EvcActionForm({
  evc,
  committeeMembers,
}: {
  evc: any;
  userRole: string;
  committeeMembers: { id: string; name: string; email: string }[];
}) {
  const router = useRouter();
  const [scheduledFor, setScheduledFor] = useState(
    evc.scheduledFor
      ? new Date(evc.scheduledFor).toISOString().slice(0, 10)
      : new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
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
          <h1 className="page-title">EVC Inspection</h1>
          <p className="page-subtitle">
            {evc.application.refNo} · {evc.application.institution.name}
          </p>
        </div>
        <Link href="/evc" className="btn btn-secondary">
          &larr; EVC Queue
        </Link>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--red-bg)",
            border: "1px solid var(--red-border)",
            color: "var(--red)",
            borderRadius: 10,
            marginBottom: 16,
          }}
        >
          {error}
        </div>
      )}

      {/* Case Overview */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <span className="card-title">Case Details</span>
        </div>
        <div className="grid-2" style={{ fontSize: 13 }}>
          <div>
            <span style={{ color: "var(--forest-muted)" }}>Institution</span>
            <br />
            <strong>{evc.application.institution.name}</strong>
          </div>
          <div>
            <span style={{ color: "var(--forest-muted)" }}>Application Type</span>
            <br />
            <span className="badge badge-blue">{formatAppType(evc.application.applicationType)}</span>
          </div>
          <div>
            <span style={{ color: "var(--forest-muted)" }}>Visit Status</span>
            <br />
            <span className="badge badge-amber">{formatStatus(evc.status)}</span>
          </div>
          <div>
            <span style={{ color: "var(--forest-muted)" }}>Classification</span>
            <br />
            {evc.isNewInstitution ? (
              <span className="badge badge-red">New Institution (30d SLA)</span>
            ) : (
              <span className="badge badge-gray">Existing</span>
            )}
          </div>
        </div>
      </div>

      {/* Schedule Form */}
      {evc.status === "QUEUED" && (
        <form onSubmit={handleSchedule} className="card">
          <div className="card-header">
            <span className="card-title">Schedule Inspection</span>
          </div>
          <div className="form-group">
            <label className="form-label">Inspection Date *</label>
            <input
              type="date"
              className="form-input"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Committee Lead *</label>
            <select
              className="form-select"
              value={committeeId}
              onChange={(e) => setCommitteeId(e.target.value)}
            >
              {committeeMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.email})
                </option>
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
              <strong>New Institution (30-day completion SLA)</strong>
            </label>
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "100%" }}>
            {loading ? "Saving..." : "Confirm Schedule"}
          </button>
        </form>
      )}

      {/* Complete Visit Form */}
      {evc.status === "SCHEDULED" && (
        <form onSubmit={handleComplete} className="card">
          <div className="card-header">
            <span className="card-title">Submit Inspection Report</span>
          </div>
          <div className="form-group">
            <label className="form-label">Report Reference Number *</label>
            <input
              type="text"
              className="form-input"
              value={reportRef}
              onChange={(e) => setReportRef(e.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: "100%" }}>
            {loading ? "Submitting..." : "Submit Report & Advance to Review"}
          </button>
        </form>
      )}

      {/* Completed State */}
      {evc.status === "COMPLETED" && (
        <div className="card" style={{ background: "var(--green-bg)", border: "1.5px solid var(--green-border)" }}>
          <h3 style={{ margin: "0 0 6px 0", color: "var(--green)" }}>Inspection Completed</h3>
          <p style={{ fontSize: 13, color: "var(--forest)", margin: "0 0 12px 0" }}>
            Report reference <strong>{evc.reportRef}</strong> recorded on{" "}
            {evc.completedAt ? new Date(evc.completedAt).toLocaleDateString() : "recently"}.
          </p>
          <Link href={`/applications/${evc.applicationId}`} className="btn btn-primary btn-sm">
            Open Application
          </Link>
        </div>
      )}
    </div>
  );
}
