"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { differenceInCalendarDays } from "date-fns";

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
  const [evidenceName, setEvidenceName] = useState("affidavit_compliance_proof.pdf");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
    try {
      await fetch(`/api/undertakings/${activeUploadId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: evidenceName, note: evidenceNote }),
      });
      setActiveUploadId(null);
      router.refresh();
    } catch {
      alert("Failed to submit evidence");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!activeVerifyId) return;
    setLoading(true);
    try {
      await fetch(`/api/undertakings/${activeVerifyId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified: verifyMode === "approve", remarks }),
      });
      setActiveVerifyId(null);
      router.refresh();
    } catch {
      alert("Failed to record verification decision");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Upload Evidence Modal */}
      {activeUploadId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <form onSubmit={handleUploadEvidence} style={{ background: "#fff", padding: 24, borderRadius: 8, width: 440 }}>
            <h3 style={{ margin: "0 0 12px 0" }}>Upload Undertaking Evidence</h3>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              Upload signed compliance affidavit or municipal sanction order.
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Document Reference / Name *</label>
              <input
                type="text"
                className="input-text"
                value={evidenceName}
                onChange={(e) => setEvidenceName(e.target.value)}
                required
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Compliance Notes</label>
              <textarea
                className="input-text"
                value={evidenceNote}
                onChange={(e) => setEvidenceNote(e.target.value)}
                rows={2}
                placeholder="Details of deficiency rectified..."
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveUploadId(null)}>Cancel</button>
              <button type="submit" disabled={loading} className="btn btn-primary btn-sm">
                {loading ? "Submitting..." : "Submit for Verification"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Verify / Reject Modal */}
      {activeVerifyId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <form onSubmit={handleVerify} style={{ background: "#fff", padding: 24, borderRadius: 8, width: 440 }}>
            <h3 style={{ margin: "0 0 12px 0" }}>
              {verifyMode === "approve" ? "✅ Verify Undertaking Compliance" : "❌ Reject Compliance Evidence"}
            </h3>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Officer Inspection Remarks *</label>
              <textarea
                className="input-text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                required
                rows={3}
                placeholder={verifyMode === "approve" ? "Verified condition fully satisfied per submitted records." : "Deficiencies persist: specify reasons for rejection..."}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveVerifyId(null)}>Cancel</button>
              <button
                type="submit"
                disabled={loading}
                className={`btn btn-sm ${verifyMode === "approve" ? "btn-primary" : "btn-danger"}`}
              >
                {loading ? "Recording..." : verifyMode === "approve" ? "Confirm Verification" : "Confirm Rejection"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Status Filter Buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {["ALL", "PENDING", "SUBMITTED", "VERIFIED", "OVERDUE"].map((s) => (
          <button
            key={s}
            className={`btn btn-sm ${filterStatus === s ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setFilterStatus(s)}
          >
            {s}
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
                <th>Title & Condition</th>
                <th>Due Date</th>
                <th>SLA Countdown</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ut) => {
                const days = differenceInCalendarDays(new Date(ut.dueDate), now);
                return (
                  <tr key={ut.id}>
                    <td>
                      <Link href={`/applications/${ut.applicationId}`} style={{ color: "#2a5298", fontWeight: 600 }}>
                        {ut.applicationRefNo}
                      </Link>
                    </td>
                    <td>{ut.institutionName}</td>
                    <td style={{ maxWidth: 260 }}>
                      <strong>{ut.title}</strong>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{ut.condition}</div>
                    </td>
                    <td>{new Date(ut.dueDate).toLocaleDateString()}</td>
                    <td>
                      {["PENDING", "OVERDUE", "SUBMITTED"].includes(ut.status) ? (
                        <span className={`sla-chip ${days < 0 ? "red" : days <= 7 ? "amber" : "green"}`}>
                          {days < 0 ? `${Math.abs(days)}d overdue` : `${days}d left`}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <span className={`badge ${statusColors[ut.status] ?? "badge-gray"}`}>{ut.status}</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {userRole === "INSTITUTION" && (ut.status === "PENDING" || ut.status === "OVERDUE" || ut.status === "REJECTED") && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setActiveUploadId(ut.id);
                              setEvidenceName(`compliance_${ut.applicationRefNo}.pdf`);
                            }}
                          >
                            📤 Upload Evidence
                          </button>
                        )}
                        {(userRole === "REGIONAL_OFFICER" || userRole === "ADMIN" || userRole === "BUREAU_OFFICER") && ut.status === "SUBMITTED" && (
                          <>
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ background: "#16a34a" }}
                              onClick={() => {
                                setActiveVerifyId(ut.id);
                                setVerifyMode("approve");
                                setRemarks("Evidence verified and found in order.");
                              }}
                            >
                              ✓ Verify
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => {
                                setActiveVerifyId(ut.id);
                                setVerifyMode("reject");
                                setRemarks("Evidence insufficient: deficiencies unresolved.");
                              }}
                            >
                              ✗ Reject
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
                  <td colSpan={7}>
                    <div className="empty-state"><p>No undertakings found matching criteria.</p></div>
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
