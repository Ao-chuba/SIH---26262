"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { differenceInCalendarDays } from "date-fns";

type DocItem = {
  id: string;
  institutionName: string;
  docType: string;
  title: string;
  validFrom: string;
  validUntil: string;
  status: string;
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
  const [renewalFileName, setRenewalFileName] = useState("registered_lease_extension.pdf");
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
    try {
      await fetch(`/api/documents/${activeRenewId}/renew`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          validUntil: new Date(newValidUntil).toISOString(),
          fileName: renewalFileName,
        }),
      });
      setActiveRenewId(null);
      router.refresh();
    } catch {
      alert("Failed to submit renewal");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(docId: string, verified: boolean) {
    setLoading(true);
    try {
      await fetch(`/api/documents/${docId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verified }),
      });
      router.refresh();
    } catch {
      alert("Failed to verify document renewal");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Upload Renewal Modal */}
      {activeRenewId && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <form onSubmit={handleRenew} style={{ background: "#fff", padding: 24, borderRadius: 8, width: 440 }}>
            <h3 style={{ margin: "0 0 12px 0" }}>Submit Document / Lease Renewal</h3>
            <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>
              Provide renewed registration term and upload legal instrument.
            </p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>New Expiry Date (Valid Until) *</label>
              <input
                type="date"
                className="input-text"
                value={newValidUntil}
                onChange={(e) => setNewValidUntil(e.target.value)}
                required
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Renewal Attachment (.pdf) *</label>
              <input
                type="text"
                className="input-text"
                value={renewalFileName}
                onChange={(e) => setRenewalFileName(e.target.value)}
                required
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveRenewId(null)}>Cancel</button>
              <button type="submit" disabled={loading} className="btn btn-primary btn-sm">
                {loading ? "Submitting..." : "Submit Renewal for Verification"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { key: "ALL", label: "All Documents" },
          { key: "EXPIRING_90", label: "Expiring ≤90 Days" },
          { key: "EXPIRED", label: "Expired" },
          { key: "RENEWAL_SUBMITTED", label: "Awaiting Verification" },
          { key: "VALID", label: "Valid" },
        ].map((f) => (
          <button
            key={f.key}
            className={`btn btn-sm ${filterBucket === f.key ? "btn-primary" : "btn-secondary"}`}
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
                <th>Doc Type</th>
                <th>Title</th>
                <th>Valid Until</th>
                <th>Validity SLA</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((doc) => {
                const days = differenceInCalendarDays(new Date(doc.validUntil), now);
                return (
                  <tr key={doc.id}>
                    <td><strong>{doc.institutionName}</strong></td>
                    <td><span className="badge badge-blue">{doc.docType.replace("_", " ")}</span></td>
                    <td>{doc.title}</td>
                    <td>{new Date(doc.validUntil).toLocaleDateString()}</td>
                    <td style={{ minWidth: 160 }}>
                      <div style={{ marginBottom: 4 }}>
                        <span className={`sla-chip ${days < 0 ? "red" : days <= 30 ? "red" : days <= 90 ? "amber" : "green"}`}>
                          {days < 0 ? `${Math.abs(days)}d expired` : `${days}d left`}
                        </span>
                      </div>
                      <div
                        className="validity-bar"
                        title={days < 0 ? "Expired" : `${days} days remaining`}
                      >
                        <div
                          className={`validity-bar-fill ${days < 0 ? "expired" : days <= 30 ? "critical" : days <= 90 ? "warn" : "ok"}`}
                          style={{
                            width: `${days < 0 ? 100 : Math.min(100, Math.max(4, (days / 365) * 100))}%`,
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
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        {userRole === "INSTITUTION" && (days <= 90 || doc.status === "EXPIRED" || doc.status === "RENEWAL_REJECTED") && (
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={() => {
                              setActiveRenewId(doc.id);
                              setRenewalFileName(`renewed_${doc.docType.toLowerCase()}_${doc.id.slice(-5)}.pdf`);
                            }}
                          >
                            🔄 Submit Renewal
                          </button>
                        )}

                        {(userRole === "REGIONAL_OFFICER" || userRole === "ADMIN" || userRole === "BUREAU_OFFICER") &&
                          doc.status === "RENEWAL_SUBMITTED" && (
                            <>
                              <button
                                className="btn btn-primary btn-sm"
                                style={{ background: "#16a34a" }}
                                disabled={loading}
                                onClick={() => handleVerify(doc.id, true)}
                              >
                                ✓ Verify
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                disabled={loading}
                                onClick={() => handleVerify(doc.id, false)}
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
                    <div className="empty-state"><p>No documents found matching criteria.</p></div>
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
