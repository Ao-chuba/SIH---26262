"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";
import { formatDocType } from "@/lib/format";
import Link from "next/link";

type DocItem = {
  id: string;
  institutionName: string;
  docType: string;
  title: string;
  validFrom: string;
  validUntil: string;
  status: string;
  remarks: string | null;
  evidence: { id: string; fileName: string } | null;
};

export function DocumentTable({
  documents,
  userRole,
  currentDateIso,
}: {
  documents: DocItem[];
  userRole: string;
  currentDateIso: string;
}) {
  const router = useRouter();
  const now = new Date(currentDateIso);
  const [filterBucket, setFilterBucket] = useState("ALL");
  const [activeRenewId, setActiveRenewId] = useState<string | null>(null);
  const [newValidUntil, setNewValidUntil] = useState(
    new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
  );
  const [renewalFileName, setRenewalFileName] = useState("");
  const [renewalFilePath, setRenewalFilePath] = useState("");
  const [renewalMime, setRenewalMime] = useState("");
  const [renewalSize, setRenewalSize] = useState(0);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifyTarget, setVerifyTarget] = useState<{ id: string; verified: boolean } | null>(null);
  const [verifyRemarks, setVerifyRemarks] = useState("");

  const filtered = documents.filter((doc) => {
    const days = differenceInCalendarDays(new Date(doc.validUntil), now);
    if (filterBucket === "EXPIRING_90") return days <= 90 && days >= 0 && doc.status !== "RENEWAL_SUBMITTED";
    if (filterBucket === "EXPIRED") return days < 0 || doc.status === "EXPIRED";
    if (filterBucket === "RENEWAL_SUBMITTED") return doc.status === "RENEWAL_SUBMITTED";
    if (filterBucket === "VALID") return days > 90 && doc.status === "VALID";
    return true;
  });

  async function handleRenew(e: React.FormEvent) {
    e.preventDefault();
    if (!activeRenewId) return;
    if (!renewalFilePath || !renewalSize) {
      setErrorMsg("Attach a PDF via the file picker before submitting.");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/documents/${activeRenewId}/renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          validUntil: new Date(newValidUntil).toISOString(),
          fileName: renewalFileName,
          filePath: renewalFilePath,
          mimeType: renewalMime,
          sizeBytes: renewalSize,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Renewal failed");
      setActiveRenewId(null);
      setRenewalFileName("");
      setRenewalFilePath("");
      setRenewalMime("");
      setRenewalSize(0);
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to submit renewal.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!verifyTarget) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/documents/${verifyTarget.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          verified: verifyTarget.verified,
          remarks: verifyRemarks.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Verification failed");
      setVerifyTarget(null);
      setVerifyRemarks("");
      router.refresh();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Failed to verify document renewal.");
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
      {verifyTarget && (
        <div className="modal-overlay" onClick={() => !loading && setVerifyTarget(null)}>
          <form onSubmit={handleVerify} className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">
              {verifyTarget.verified ? "Verify Document Renewal" : "Reject Document Renewal"}
            </div>
            <div className="form-group">
              <label className="form-label">Remarks {verifyTarget.verified ? "(optional)" : "*"}</label>
              <textarea
                className="form-input"
                rows={3}
                value={verifyRemarks}
                onChange={(e) => setVerifyRemarks(e.target.value)}
                placeholder={
                  verifyTarget.verified
                    ? "Optional verification note..."
                    : "Reason for rejection..."
                }
                required={!verifyTarget.verified}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" disabled={loading} onClick={() => setVerifyTarget(null)}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className={verifyTarget.verified ? "btn btn-success" : "btn btn-danger"}
              >
                {loading ? "Saving..." : verifyTarget.verified ? "Confirm Verify" : "Confirm Reject"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Upload Renewal Modal */}
      {activeRenewId && (
        <div className="modal-overlay" onClick={() => setActiveRenewId(null)}>
          <form onSubmit={handleRenew} className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">Submit Renewal</div>
            <div className="form-group">
              <label className="form-label">New Expiry Date *</label>
              <input
                type="date"
                className="form-input"
                value={newValidUntil}
                onChange={(e) => setNewValidUntil(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Attach Renewal Document (.pdf) *</label>
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
                    setRenewalFileName(d.fileName || f.name);
                    setRenewalFilePath(d.filePath);
                    setRenewalMime(d.mimeType || f.type || "application/pdf");
                    setRenewalSize(Number(d.sizeBytes) || f.size);
                  } else {
                    setErrorMsg(d.error || "Upload failed");
                  }
                }}
              />
              <small style={{ color: "var(--forest-muted)", fontSize: 12 }}>
                Selected: <strong>{renewalFileName || "none"}</strong>
                {renewalSize > 0 ? ` · ${renewalSize.toLocaleString()} bytes` : ""}
              </small>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setActiveRenewId(null)}>
                Cancel
              </button>
              <button type="submit" disabled={loading} className="btn btn-primary">
                {loading ? "Submitting..." : "Submit Renewal"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="tabs">
        {[
          { key: "ALL", label: "All" },
          { key: "EXPIRING_90", label: "Expiring ≤90d" },
          { key: "EXPIRED", label: "Expired" },
          { key: "RENEWAL_SUBMITTED", label: "Awaiting Verification" },
          { key: "VALID", label: "Valid" },
        ].map((f) => (
          <button
            key={f.key}
            type="button"
            className={`tab ${filterBucket === f.key ? "active" : ""}`}
            onClick={() => setFilterBucket(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Institution</th>
                <th>Type</th>
                <th>Title</th>
                <th>Valid Until</th>
                <th>Validity</th>
                <th>Status</th>
                <th>Evidence / Remarks</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc) => {
                const days = differenceInCalendarDays(new Date(doc.validUntil), now);
                return (
                  <tr key={doc.id}>
                    <td style={{ fontWeight: 700 }}>{doc.institutionName}</td>
                    <td><span className="badge badge-blue">{formatDocType(doc.docType)}</span></td>
                    <td>{doc.title}</td>
                    <td>{new Date(doc.validUntil).toLocaleDateString()}</td>
                    <td style={{ minWidth: 165 }}>
                      <div style={{ marginBottom: 4 }}>
                        <span className={`sla-chip ${days < 0 ? "red" : days <= 30 ? "red" : days <= 90 ? "amber" : "green"}`}>
                          {days < 0 ? `Expired ${Math.abs(days)}d` : `${days}d left`}
                        </span>
                      </div>
                      <div
                        className="validity-bar"
                        title={days < 0 ? "Expired" : `${days} days remaining`}
                      >
                        <div
                          className={`validity-bar-fill ${days < 0 ? "expired" : days <= 30 ? "critical" : days <= 90 ? "warn" : "ok"}`}
                          style={{
                            width: `${days < 0 ? 100 : Math.min(100, Math.max(6, (days / 365) * 100))}%`,
                          }}
                        />
                      </div>
                    </td>
                    <td>
                      {doc.status === "RENEWAL_SUBMITTED" ? (
                        <span className="badge badge-amber">Renewal Submitted</span>
                      ) : days < 0 || doc.status === "EXPIRED" ? (
                        <span className="badge badge-red">Expired</span>
                      ) : days <= 90 ? (
                        <span className="badge badge-orange">Expiring Soon</span>
                      ) : (
                        <span className="badge badge-green">Valid</span>
                      )}
                    </td>
                    <td style={{ minWidth: 180, fontSize: 12 }}>
                      {doc.evidence ? (
                        <Link href={`/api/evidence/${doc.evidence.id}`} className="table-link">
                          {doc.evidence.fileName}
                        </Link>
                      ) : "—"}
                      {doc.remarks && <div style={{ marginTop: 4, color: "var(--forest-muted)" }}>{doc.remarks}</div>}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {userRole === "INSTITUTION" &&
                          (days <= 90 || doc.status === "EXPIRED" || doc.status === "RENEWAL_REJECTED") && (
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => {
                                setActiveRenewId(doc.id);
                                setRenewalFileName(`renewed_${doc.docType.toLowerCase()}_${doc.id.slice(-5)}.pdf`);
                              }}
                            >
                              Submit Renewal
                            </button>
                          )}

                        {(userRole === "REGIONAL_OFFICER" || userRole === "ADMIN" || userRole === "BUREAU_OFFICER") &&
                          doc.status === "RENEWAL_SUBMITTED" && (
                            <>
                              <button
                                type="button"
                                className="btn btn-success btn-sm"
                                disabled={loading}
                                onClick={() => {
                                  setVerifyRemarks("");
                                  setVerifyTarget({ id: doc.id, verified: true });
                                }}
                              >
                                Verify
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                disabled={loading}
                                onClick={() => {
                                  setVerifyRemarks("");
                                  setVerifyTarget({ id: doc.id, verified: false });
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
                    <div className="empty-state"><p>No documents found.</p></div>
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
