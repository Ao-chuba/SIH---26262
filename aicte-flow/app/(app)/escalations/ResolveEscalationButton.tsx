"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ResolveEscalationButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function resolve() {
    const note = window.prompt("Resolution note")?.trim();
    if (!note) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/escalations/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not resolve escalation");
      router.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not resolve escalation");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-success btn-sm" disabled={busy} onClick={resolve}>
      {busy ? "Resolving..." : "Resolve"}
    </button>
  );
}
