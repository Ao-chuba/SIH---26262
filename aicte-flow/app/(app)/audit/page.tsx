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

  const tamperBackup = await prisma.ruleConfig.findUnique({
    where: { key: "AUDIT_TAMPER_DEMO_BACKUP" },
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Ledger</h1>
          <p className="page-subtitle">SHA-256 hash-chained event log</p>
        </div>
        <a href="/api/audit?format=csv" className="btn btn-secondary btn-sm">
          Export CSV &rarr;
        </a>
      </div>

      <AuditTable
        initialLogs={logs.map((l) => ({ ...l, ts: l.ts.toISOString() }))}
        isAdmin={user.role === "ADMIN"}
        tamperActive={!!tamperBackup}
      />
    </div>
  );
}
