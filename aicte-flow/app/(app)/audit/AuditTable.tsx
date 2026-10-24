"use client";

import { useState } from "react";
import { formatAction, formatEntityType, formatRole } from "@/lib/format";

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
        result: { ok: false, message: "Verification failed" },
      });
    }
  }

  async function handleTamper(action: "simulate" | "restore") {
    if (
      !window.confirm(
        action === "simulate"
          ? "Run an integrity break test? Chain verification will fail until restored."
          : "Restore the audit chain to its verified state?"
      )
    ) return;
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
      <div className="filter-bar" style={{ justifyContent: "space-between" }}>
        <input
          type="text"
          className="form-input"
          placeholder="Filter by action, role, or entity..."
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          style={{ minWidth: 260, flex: 1, maxWidth: 360 }}
        />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isAdmin && (
            <>
              <button
                onClick={() => handleTamper("simulate")}
                disabled={tamperBusy || tamperOn}
                className="btn btn-danger btn-sm"
              >
                Integrity Break Test
              </button>
              <button
                onClick={() => handleTamper("restore")}
                disabled={tamperBusy || !tamperOn}
                className="btn btn-secondary btn-sm"
              >
                Restore
              </button>
            </>
          )}
          <button
            onClick={handleVerify}
            disabled={verifyStatus.running}
            className="btn btn-primary btn-sm"
          >
            {verifyStatus.running ? "Verifying..." : "Verify Chain"}
          </button>
        </div>
      </div>

      {tamperMsg && (
        <div
          style={{
            padding: "12px 16px",
            marginBottom: 14,
            borderRadius: 12,
            background: "var(--amber-bg)",
            border: "1.5px solid var(--amber-border)",
            color: "var(--amber)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {tamperMsg}
        </div>
      )}

      {verifyStatus.result && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            marginBottom: 16,
            background: verifyStatus.result.ok ? "var(--green-bg)" : "var(--red-bg)",
            border: `1.5px solid ${verifyStatus.result.ok ? "var(--green-border)" : "var(--red-border)"}`,
            color: verifyStatus.result.ok ? "var(--green)" : "var(--red)",
          }}
        >
          {verifyStatus.result.ok ? (
            <div>
              <strong>Chain Verified:</strong> All SHA-256 hashes match from sequence #1.
            </div>
          ) : (
            <div>
              <strong>Hash Mismatch Detected:</strong> Chain broken at sequence #{verifyStatus.result.brokenAtSeq}.
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 64 }}>Seq</th>
                <th>Timestamp</th>
                <th>Role</th>
                <th>Action</th>
                <th>Entity</th>
                <th>SHA-256 Hash</th>
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
                    <td className="font-mono"><strong>#{log.seq}</strong></td>
                    <td style={{ fontSize: 12, color: "var(--forest-muted)", whiteSpace: "nowrap" }}>
                      {new Date(log.ts).toLocaleString()}
                    </td>
                    <td>
                      {log.actorRole ? (
                        <span className="badge badge-blue">{formatRole(log.actorRole)}</span>
                      ) : (
                        <span className="badge badge-gray">System</span>
                      )}
                    </td>
                    <td><span className="badge badge-amber">{formatAction(log.action)}</span></td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{formatEntityType(log.entityType)}</span>{" "}
                      <small className="font-mono" style={{ color: "var(--forest-muted)" }}>
                        ({log.entityId.slice(0, 8)})
                      </small>
                    </td>
                    <td>
                      <code
                        style={{
                          fontSize: 11,
                          background: "var(--bg)",
                          border: "1px solid var(--border)",
                          padding: "2px 6px",
                          borderRadius: 6,
                        }}
                      >
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
                        <pre
                          style={{
                            marginTop: 8,
                            padding: 10,
                            background: "var(--forest)",
                            color: "var(--highlighter-yellow)",
                            borderRadius: 10,
                            fontSize: 11,
                            overflowX: "auto",
                            maxWidth: 380,
                          }}
                        >
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
                    <div className="empty-state"><p>No audit records found.</p></div>
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
