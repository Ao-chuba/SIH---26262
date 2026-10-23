"use client";

import { useState } from "react";

type LogEntry = {
  seq: number;
  ts: string;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string;
  payload: string;
  prevHash: string;
  hash: string;
};

export function AuditTable({
  initialLogs,
  isAdmin = false,
  tamperActive = false,
}: {
  initialLogs: LogEntry[];
  isAdmin?: boolean;
  tamperActive?: boolean;
}) {
  const [filterAction, setFilterAction] = useState("");
  const [expandedSeq, setExpandedSeq] = useState<number | null>(null);
  const [tamperOn, setTamperOn] = useState(tamperActive);
  const [tamperMsg, setTamperMsg] = useState<string | null>(null);
  const [tamperBusy, setTamperBusy] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState<{
    running: boolean;
    result?: { ok: boolean; count?: number; brokenAtSeq?: number; message?: string };
  }>({ running: false });

  async function handleVerify() {
    setVerifyStatus({ running: true });
    try {
      const res = await fetch("/api/audit/verify");
      const data = await res.json();
      setVerifyStatus({ running: false, result: data });
    } catch {
      setVerifyStatus({
        running: false,
        result: { ok: false, message: "Verification failed to complete" },
      });
    }
  }

  async function handleTamper(action: "simulate" | "restore") {
    setTamperBusy(true);
    setTamperMsg(null);
    try {
      const res = await fetch("/api/audit/tamper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Tamper action failed");
      setTamperOn(action === "simulate");
      setTamperMsg(data.message);
      setVerifyStatus({ running: false });
    } catch (e: unknown) {
      setTamperMsg(e instanceof Error ? e.message : "Tamper action failed");
    } finally {
      setTamperBusy(false);
    }
  }

  const filtered = initialLogs.filter((l) => {
    if (!filterAction) return true;
    return (
      l.action.toLowerCase().includes(filterAction.toLowerCase()) ||
      l.entityType.toLowerCase().includes(filterAction.toLowerCase()) ||
      (l.actorRole && l.actorRole.toLowerCase().includes(filterAction.toLowerCase()))
    );
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="text"
            className="input-text"
            placeholder="Filter by action, role, entity..."
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            style={{ width: 260 }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isAdmin && (
            <>
              <button
                onClick={() => handleTamper("simulate")}
                disabled={tamperBusy || tamperOn}
                className="btn btn-secondary"
                title="Demo only: mutate one payload without updating its hash"
              >
                🧪 Simulate Tamper
              </button>
              <button
                onClick={() => handleTamper("restore")}
                disabled={tamperBusy || !tamperOn}
                className="btn btn-secondary"
              >
                ↩️ Restore
              </button>
            </>
          )}
          <button
            onClick={handleVerify}
            disabled={verifyStatus.running}
            className="btn btn-primary"
            style={{ background: "#0f766e" }}
          >
            {verifyStatus.running ? "Verifying SHA-256 chain..." : "🛡️ Verify Chain Integrity"}
          </button>
        </div>
      </div>

      {tamperMsg && (
        <div style={{ padding: "10px 14px", marginBottom: 12, borderRadius: 8, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontSize: 13 }}>
          {tamperMsg}
        </div>
      )}

      {verifyStatus.result && (
        <div
          style={{
            padding: "14px 18px",
            borderRadius: 8,
            marginBottom: 16,
            background: verifyStatus.result.ok ? "#ecfdf5" : "#fef2f2",
            border: `1px solid ${verifyStatus.result.ok ? "#a7f3d0" : "#fecaca"}`,
            color: verifyStatus.result.ok ? "#065f46" : "#991b1b",
          }}
        >
          {verifyStatus.result.ok ? (
            <div>
              <strong>✅ Hash Chain Verification Passed:</strong> All cryptographic hashes in the ledger are verified and intact from sequence #1. No tampering detected.
            </div>
          ) : (
            <div>
              <strong>❌ Cryptographic Chain Violation Detected!</strong> Tamper detected at sequence #{verifyStatus.result.brokenAtSeq}. The computed hash does not match stored block.
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 60 }}>Seq</th>
                <th>Timestamp</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Hash Digest</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log) => {
                const isExpanded = expandedSeq === log.seq;
                let prettyPayload = log.payload;
                try {
                  prettyPayload = JSON.stringify(JSON.parse(log.payload), null, 2);
                } catch {}

                return (
                  <tr key={log.seq}>
                    <td><strong>#{log.seq}</strong></td>
                    <td style={{ fontSize: 12, color: "#64748b" }}>
                      {new Date(log.ts).toLocaleString()}
                    </td>
                    <td>
                      {log.actorRole ? (
                        <span className="badge badge-blue">{log.actorRole}</span>
                      ) : (
                        <span className="badge badge-gray">SYSTEM</span>
                      )}
                    </td>
                    <td><span className="badge badge-amber">{log.action}</span></td>
                    <td>
                      {log.entityType} <small style={{ color: "#94a3b8" }}>({log.entityId.slice(0, 8)}...)</small>
                    </td>
                    <td>
                      <code style={{ fontSize: 11, background: "#f1f5f9", padding: "2px 4px", borderRadius: 4 }}>
                        {log.hash.slice(0, 10)}...{log.hash.slice(-6)}
                      </code>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setExpandedSeq(isExpanded ? null : log.seq)}
                      >
                        {isExpanded ? "Hide" : "Inspect"}
                      </button>
                      {isExpanded && (
                        <pre style={{ marginTop: 8, padding: 8, background: "#0f172a", color: "#38bdf8", borderRadius: 6, fontSize: 11, overflowX: "auto" }}>
                          {prettyPayload}
                        </pre>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state"><p>No audit records found matching criteria.</p></div>
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
