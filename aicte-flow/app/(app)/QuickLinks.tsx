import Link from "next/link";
import { prisma } from "@/lib/db";

/** Quick-access links to sample applications that cover each approval route. */
export async function QuickLinks({
  userRole,
  regionId,
  institutionId,
}: {
  userRole: string;
  regionId?: string | null;
  institutionId?: string | null;
}) {
  const where: {
    refNo: { startsWith: string };
    institutionId?: string;
    regionId?: string;
  } = { refNo: { startsWith: "DEMO-" } };
  if (userRole === "INSTITUTION" && institutionId) where.institutionId = institutionId;
  if (userRole === "REGIONAL_OFFICER" && regionId) where.regionId = regionId;

  const list = await prisma.application.findMany({
    where,
    select: {
      id: true,
      refNo: true,
      currentStageKey: true,
      status: true,
      applicationType: true,
    },
    orderBy: { refNo: "asc" },
  });

  if (list.length === 0) return null;

  return (
    <div
      className="card"
      style={{
        marginBottom: 16,
        border: "1.5px solid var(--border)",
        background: "var(--card-bg)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 10 }}>
        <div>
          <div className="card-title" style={{ margin: 0 }}>
            Reference Applications
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "4px 0 0" }}>
            Sample files covering all approval routes. Begin with{" "}
            <strong>DEMO-NEW-INST-001</strong> for the full statutory path.
          </p>
        </div>
        {userRole === "ADMIN" && (
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/admin" className="btn btn-secondary btn-sm">
              Admin
            </Link>
            <Link href="/audit" className="btn btn-secondary btn-sm">
              Audit
            </Link>
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {list.map((d) => (
          <Link
            key={d.id}
            href={`/applications/${d.id}`}
            className="btn btn-secondary btn-sm"
            style={{
              fontFamily: "var(--font-mono)",
              fontWeight: d.refNo === "DEMO-NEW-INST-001" ? 800 : 600,
              borderColor: d.refNo === "DEMO-NEW-INST-001" ? "var(--forest)" : undefined,
            }}
          >
            {d.refNo}
            <span style={{ opacity: 0.65, marginLeft: 6, fontWeight: 500 }}>
              {d.currentStageKey.replace(/_/g, " ")}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
