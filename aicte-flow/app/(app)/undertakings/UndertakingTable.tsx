"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";
import { formatStatus } from "@/lib/format";

type UndertakingItem = {
  id: string;
  applicationId: string;
  applicationRefNo: string;
  institutionName: string;
  title: string;
  condition: string;
  dueDate: string;
  status: string;
  remarks: string | null;
  evidence: { id: string; fileName: string; note: string | null } | null;
};

export function UndertakingTable({
  undertakings,
  userRole,
  currentDateIso,
}: {
  undertakings: UndertakingItem[];
  userRole: string;
  currentDateIso: string;
}) {
  const router = useRouter();
  const now = new Date(currentDateIso);
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);
  const [activeVerifyId, setActiveVerifyId] = useState<string | null>(null);
  const [verifyMode, setVerifyMode] = useState<"approve" | "reject">("approve");
  const [evidenceName, setEvidenceName] = useState("");
  const [evidencePath, setEvidencePath] = useState("");
  const [evidenceMime, setEvidenceMime] = useState("");
  const [evidenceSize, setEvidenceSize] = useState(0);
  const [evidenceNote, setEvidenceNote] = useState("");
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const statusColors: Record<string, string> = {
    PENDING: "badge-blue",
    SUBMITTED: "badge-amber",
    VERIFIED: "badge-green",
    REJECTED: "badge-red",
    OVERDUE: "badge-red",
    CLOSED: "badge-gray",
  };

  const filtered = undertakings.filter((u) => {
    if (filterStatus === "ALL") return true;
    return u.status === filterStatus;
  });

  async function handleUploadEvidence(e: React.FormEvent) {
    e.preventDefault();
    if (!activeUploadId) return;
    if (!evidencePath || !evidenceSize) {
      setErrorMsg("Attach a PDF via the file picker before submitting.");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/undertakings/${activeUploadId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: evidenceName,
          filePath: evidencePath,
          mimeType: evidenceMime,
          sizeBytes: evidenceSize,
          note: evidenceNote,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Submit failed");
      setActiveUploadId(null);
      setEvidenceName("");
      setEvidencePath("");
      setEvidenceMime("");
      setEvidenceSize(0);
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit evidence.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!activeVerifyId) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/undertakings/${activeVerifyId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified: verifyMode === "approve", remarks }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Verification failed");
      setActiveVerifyId(null);
      router.refresh();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Failed to record verification decision.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {errorMsg && (
        <div style={{ padding: "10px 14px", marginBottom: 12, borderRadius: 10, background: "var(--red-bg)", border: "1px solid var(--red-border)", color: "var(--red)", fontSize: 13, fontWeight: 600 }}>
          {errorMsg}
        </div>
      )}
      {/* Upload Evidence Modal */}
      {activeUploadId && (
        <div className="modal-overlay" onClick={() => setActiveUploadId(null)}>
          <form onSubmit={handleUploadEvidence} className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Upload Undertaking Evidence</div>
            <p style={{ fontSize: 12.5, color: "var(--forest-muted)", marginBottom: 14 }}>
              Attach compliance proof. The undertaking closes once verified by the Regional Officer.
            </p>
            <div className="form-group">
              <label className="form-label">Attach Compliance Proof (.pdf) *</label>
              <input
                type="file"
                accept=".pdf,application/pdf"
                className="form-input"
                style={{ padding: "8px 12px", background: "#fff", marginBottom: 6 }}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const fd = new FormData();
                  fd.append("file", f);
                  const r = await fetch("/api/upload", { method: "POST", body: fd });
                  const d = await r.json();
                  if (r.ok) {
                    setEvidenceName(d.fileName || f.name);
                    setEvidencePath(d.filePath);
                    setEvidenceMime(d.mimeType || f.type || "application/pdf");
                    setEvidenceSize(Number(d.sizeBytes) || f.size);
                  } else {
                    setErrorMsg(d.error || "Upload failed");
                  }
                }}
              />
              <small style={{ color: "var(--forest-muted)", fontSize: 12 }}>
                Selected: <strong>{evidenceName || "none"}</strong>
                {evidenceSize > 0 ? ` · ${evidenceSize.toLocaleString()} bytes` : ""}
              </small>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-textarea"
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)}
                rows={3}
                placeholder="Summary of compliance action taken..."
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setActiveUploadId(null)}>
                Cancel
              </button>
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? "Submitting..." : "Submit"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Verify / Reject Modal */}
      {activeVerifyId && (
        <div className="modal-overlay" onClick={() => setActiveVerifyId(null)}>
          <form onSubmit={handleVerify} className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              {verifyMode === "approve" ? "Verify Undertaking" : "Reject Evidence"}
            </div>
            <div className="form-group">
              <label className="form-label">Remarks *</label>
              <textarea
                className="form-textarea"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                required
                rows={3}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setActiveVerifyId(null)}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`btn ${verifyMode === "approve" ? "btn-success" : "btn-danger"}`}
              >
                {loading ? "Saving..." : verifyMode === "approve" ? "Verify" : "Reject"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Status Filter Tabs */}
      <div className="tabs">
        {["ALL", "PENDING", "SUBMITTED", "VERIFIED", "OVERDUE"].map((s) => (
          <button
            key={s}
            type="button"
            className={`tab ${filterStatus === s ? "active" : ""}`}
            onClick={() => setFilterStatus(s)}
          >
            {s === "ALL" ? "All" : formatStatus(s)}
          </button>
        ))}
      </div>

      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Application</th>
                <th>Institution</th>
                <th>Condition</th>
                <th>Due Date</th>
                <th>SLA</th>
                <th>Status</th>
                <th>Evidence / Remarks</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ut) => {
                const days = differenceInCalendarDays(new Date(ut.dueDate), now);
                return (
                  <tr key={ut.id}>
                    <td>
                      <Link href={`/applications/${ut.applicationId}`} className="table-link font-mono">
                        {ut.applicationRefNo}
                      </Link>
                    </td>
                    <td style={{ fontWeight: 700 }}>{ut.institutionName}</td>
                    <td style={{ maxWidth: 290 }}>
                      <div style={{ fontWeight: 700, color: "var(--forest)" }}>{ut.title}</div>
                      <div style={{ fontSize: 12, color: "var(--forest-muted)", marginTop: 2 }}>{ut.condition}</div>
                    </td>
                    <td>{new Date(ut.dueDate).toLocaleDateString()}</td>
                    <td>
                      {["PENDING", "OVERDUE", "SUBMITTED"].includes(ut.status) ? (
                        <span className={`sla-chip ${days < 0 ? "red" : days <= 7 ? "amber" : "green"}`}>
                          {days < 0 ? `Overdue ${Math.abs(days)}d` : `Due ${days}d`}
                        </span>
                      ) : (
                        <span style={{ color: "var(--forest-light)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${statusColors[ut.status] ?? "badge-gray"}`}>{formatStatus(ut.status)}</span>
                    </td>
                    <td style={{ minWidth: 190, fontSize: 12 }}>
                      {ut.evidence ? (
                        <Link href={`/api/evidence/${ut.evidence.id}`} className="table-link">
                          {ut.evidence.fileName}
                        </Link>
                      ) : "—"}
                      {ut.evidence?.note && <div style={{ marginTop: 4, color: "var(--forest-muted)" }}>{ut.evidence.note}</div>}
                      {ut.remarks && <div style={{ marginTop: 4, color: "var(--forest-muted)" }}>{ut.remarks}</div>}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {userRole === "INSTITUTION" &&
                          (ut.status === "PENDING" || ut.status === "OVERDUE" || ut.status === "REJECTED") && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                setActiveUploadId(ut.id);
                                setEvidenceName(`compliance_${ut.applicationRefNo}.pdf`);
                              }}
                            >
                              Upload Evidence
                            </button>
                          )}
                        {(userRole === "REGIONAL_OFFICER" || userRole === "ADMIN" || userRole === "BUREAU_OFFICER") &&
                          ut.status === "SUBMITTED" && (
                            <>
                              <button
                                className="btn btn-success btn-sm"
                                onClick={() => {
                                  setActiveVerifyId(ut.id);
                                  setVerifyMode("approve");
                                  setRemarks("Verified and found in order.");
                                }}
                              >
                                Verify
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => {
                                  setActiveVerifyId(ut.id);
                                  setVerifyMode("reject");
                                  setRemarks("Evidence insufficient.");
                                }}
                              >
                                Reject
                              </button>
                            </>
                          )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state"><p>No undertakings found.</p></div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
