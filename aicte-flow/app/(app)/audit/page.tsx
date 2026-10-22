import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { AuditTable } from "./AuditTable";

export default async function AuditPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (!["ADMIN", "BUREAU_OFFICER", "REGIONAL_OFFICER"].includes(user.role)) {
    redirect("/dashboard");
  }

  const logs = await prisma.auditLog.findMany({
    orderBy: { seq: "desc" },
    take: 100,
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Tamper-Evident Audit Trail</h1>
          <p className="page-subtitle">Cryptographic SHA-256 Hash-Chained System Ledger</p>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <a href="/api/audit?format=csv" className="btn btn-secondary">
            📥 Export CSV
          </a>
        </div>
      </div>

      <div style={{ marginBottom: 20, padding: "14px 18px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, color: "#475569" }}>
        <strong>🔒 Immutability Guarantee:</strong> Every audit entry is cryptographically linked to the previous entry via SHA-256 hash chaining: <code>hash = sha256(prevHash + ts + actor + action + entity + payload)</code>. Any database modification or row deletion invalidates the chain.
      </div>

      <AuditTable initialLogs={logs.map(l => ({ ...l, ts: l.ts.toISOString() }))} />
    </div>
  );
}
