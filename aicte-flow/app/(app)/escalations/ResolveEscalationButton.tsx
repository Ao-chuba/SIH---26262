"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ResolveEscalationButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function resolve(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = note.trim();
    if (trimmed.length < 5) {
      setError("Resolution note must be at least 5 characters");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/escalations/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: trimmed }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not resolve escalation");
      setOpen(false);
      setNote("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve escalation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={() => setOpen(true)}>
        Resolve
      </button>
      {open && (
        <div className="modal-overlay" onClick={() => !busy && setOpen(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={resolve}>
            <div className="modal-title">Resolve Escalation</div>
            {error && (
              <div
                style={{
                  padding: "8px 12px",
                  marginBottom: 12,
                  borderRadius: 10,
                  background: "var(--red-bg)",
                  border: "1px solid var(--red-border)",
                  color: "var(--red)",
                  fontSize: 12.5,
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Resolution note *</label>
              <textarea
                className="form-input"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Action taken / why this escalation is closed..."
                required
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-success" disabled={busy}>
                {busy ? "Resolving..." : "Confirm Resolve"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
