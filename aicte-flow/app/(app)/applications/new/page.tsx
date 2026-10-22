"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const ROUTE_PREVIEWS: Record<string, string[]> = {
  NEW_INSTITUTION: ["Scrutiny", "EVC Queue", "EVC Scheduled", "EVC Report", "SAC / SHC", "Decision Pending"],
  NEW_COURSE: ["Scrutiny", "EVC Queue", "EVC Scheduled", "EVC Report", "Decision Pending"],
  INTAKE_INCREASE: ["Scrutiny", "EVC Queue", "EVC Scheduled", "EVC Report", "Decision Pending"],
  EXTENSION: ["Scrutiny", "Decision Pending"],
  CLOSURE: ["Scrutiny", "Decision Pending"],
};

export default function NewApplicationPage() {
  const router = useRouter();
  const [appType, setAppType] = useState("NEW_COURSE");
  const [program, setProgram] = useState("Engineering & Technology");
  const [courseName, setCourseName] = useState("Computer Science & Engineering (AI & ML)");
  const [intake, setIntake] = useState("60");
  const [academicYear, setAcademicYear] = useState("2026-2027");
  const [details, setDetails] = useState("");
  const [fileName, setFileName] = useState("institutional_dpr_and_infrastructure.pdf");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const routeSteps = ROUTE_PREVIEWS[appType] ?? ["Scrutiny", "Decision Pending"];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationType: appType,
          details: `${program} - ${courseName} (Intake: ${intake}, Academic Year: ${academicYear}). ${details}`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || "Failed to create application");
      }

      router.push(`/applications/${data.id}`);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Submit New AICTE Application</h1>
          <p className="page-subtitle">Approval Process Handbook (APH) Workflows</p>
        </div>
        <Link href="/dashboard" className="btn btn-secondary">
          Cancel
        </Link>
      </div>

      {error && (
        <div style={{ padding: "12px 16px", background: "#fef2f2", color: "#dc2626", borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card" style={{ padding: 28 }}>
        <h3 style={{ margin: "0 0 16px 0", fontSize: 16 }}>1. Application Classification</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Application Type *
            </label>
            <select
              className="input-text"
              value={appType}
              onChange={(e) => setAppType(e.target.value)}
              style={{ width: "100%" }}
            >
              <option value="NEW_COURSE">New Course / Additional Specialisation</option>
              <option value="INTAKE_INCREASE">Increase in Intake</option>
              <option value="EXTENSION">Extension of Approval (EoA)</option>
              <option value="NEW_INSTITUTION">Setting up New Technical Institution</option>
              <option value="CLOSURE">Closure of Program / Institution</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Academic Year *
            </label>
            <input
              type="text"
              className="input-text"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        {/* Dynamic Route Preview Banner */}
        <div style={{ padding: "14px 18px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
            🔄 Configured Automated Workflow Route:
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {routeSteps.map((step, idx) => (
              <span key={step} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="badge badge-green" style={{ fontSize: 12 }}>
                  {idx + 1}. {step}
                </span>
                {idx < routeSteps.length - 1 && <span style={{ color: "#86efac" }}>→</span>}
              </span>
            ))}
          </div>
        </div>

        <h3 style={{ margin: "0 0 16px 0", fontSize: 16 }}>2. Program & Intake Particulars</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Discipline / Faculty *
            </label>
            <select
              className="input-text"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              style={{ width: "100%" }}
            >
              <option>Engineering & Technology</option>
              <option>Management (MBA / PGDM)</option>
              <option>Pharmacy</option>
              <option>Computer Applications (MCA)</option>
              <option>Architecture & Planning</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              Proposed Intake (Seats) *
            </label>
            <input
              type="number"
              className="input-text"
              value={intake}
              onChange={(e) => setIntake(e.target.value)}
              style={{ width: "100%" }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Course / Specialisation Title *
          </label>
          <input
            type="text"
            className="input-text"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Additional Remarks / Justification
          </label>
          <textarea
            className="input-text"
            rows={3}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Provide context on infrastructure readiness, faculty availability, and laboratory equipment..."
            style={{ width: "100%" }}
          />
        </div>

        <h3 style={{ margin: "0 0 16px 0", fontSize: 16 }}>3. Mandatory Attachments</h3>
        <div style={{ padding: 16, background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 8, marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Institutional Detailed Project Report (DPR) & Infrastructure Affidavit (.pdf)
          </label>
          <input
            type="text"
            className="input-text"
            value={fileName}
            onChange={(e) => setFileName(e.target.value)}
            style={{ width: "100%", marginBottom: 8 }}
          />
          <small style={{ color: "#64748b" }}>
            * Attached document metadata will be recorded in the institutional compliance registry.
          </small>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, borderTop: "1px solid #e2e8f0", paddingTop: 20 }}>
          <Link href="/dashboard" className="btn btn-secondary">
            Cancel
          </Link>
          <button type="submit" disabled={submitting} className="btn btn-primary" style={{ minWidth: 160 }}>
            {submitting ? "Submitting Application..." : "🚀 Submit Application"}
          </button>
        </div>
      </form>
    </div>
  );
}
