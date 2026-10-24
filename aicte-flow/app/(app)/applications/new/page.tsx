"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isValidIntake, requiredFaculty } from "@/lib/aph";
import { APH_NORMS } from "@/config/rules";

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
  const [faculty, setFaculty] = useState("12");
  const [academicYear, setAcademicYear] = useState("2026-2027");
  const [details, setDetails] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setFileName(data.fileName || file.name);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to upload PDF");
    } finally {
      setUploadingFile(false);
    }
  }

  const routeSteps = ROUTE_PREVIEWS[appType] ?? ["Scrutiny", "Decision Pending"];
  const intakeNum = Number(intake) || 0;
  const facultyNum = Number(faculty) || 0;
  const intakeOk = isValidIntake(intakeNum);
  const needFac = intakeOk ? requiredFaculty(intakeNum) : 0;
  const facultyOk = intakeOk && facultyNum >= needFac;

  const gate = useMemo(() => {
    if (!intakeOk) {
      return {
        ok: false,
        title: "APH Advisory: Non-standard Intake Division",
        body: `${intakeNum || "—"} seats is not a multiple of 30/60. Standard divisions: 30, 60, 120, 180.`,
      };
    }
    if (!facultyOk) {
      return {
        ok: false,
        title: "APH Advisory: Faculty–Student Ratio Shortfall",
        body: `${facultyNum} faculty for ${intakeNum} seats is below 1:${APH_NORMS.facultyStudentRatio} (minimum ${needFac} required).`,
      };
    }
    return {
      ok: true,
      title: "APH Pre-Submission Check Passed",
      body: `Intake (${intakeNum} seats) and declared faculty (${facultyNum} ≥ ${needFac}) meet APH norms.`,
    };
  }, [intakeOk, facultyOk, intakeNum, facultyNum, needFac]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fileName.trim()) {
      setError("Please attach the DPR & Infrastructure Affidavit (.pdf) before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationType: appType,
          details: `${program} - ${courseName} (Intake: ${intake}, Faculty: ${faculty}, Academic Year: ${academicYear}). Attachment: ${fileName}. ${details}`.trim(),
          studentIntake: intakeNum,
          facultyCount: facultyNum,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "Failed to create application");
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
          <h1 className="page-title">New Application</h1>
          <p className="page-subtitle">Assistive APH checks flag issues without replacing officer scrutiny</p>
        </div>
        <Link href="/dashboard" className="btn btn-secondary">
          Cancel
        </Link>
      </div>

      {error && (
        <div
          style={{
            padding: "12px 16px",
            background: "var(--red-bg)",
            border: "1.5px solid var(--red-border)",
            color: "var(--red)",
            borderRadius: 12,
            marginBottom: 16,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card" style={{ padding: 28 }}>
        <div className="card-title" style={{ marginBottom: 16 }}>
          1. Application Type
        </div>
        <div className="grid-2" style={{ marginBottom: 20 }}>
          <div>
            <label className="form-label">Category *</label>
            <select
              className="form-select"
              value={appType}
              onChange={(e) => setAppType(e.target.value)}
            >
              <option value="NEW_COURSE">New Course / Additional Specialisation</option>
              <option value="INTAKE_INCREASE">Increase in Intake</option>
              <option value="EXTENSION">Extension of Approval (EoA)</option>
              <option value="NEW_INSTITUTION">New Technical Institution</option>
              <option value="CLOSURE">Closure of Program / Institution</option>
            </select>
          </div>

          <div>
            <label className="form-label">Academic Year *</label>
            <input
              type="text"
              className="form-input"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
            />
          </div>
        </div>

        <div
          style={{
            padding: "12px 16px",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--forest-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 8,
            }}
          >
            Workflow Route
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {routeSteps.map((step, idx) => (
              <span key={step} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="badge badge-blue" style={{ fontSize: 11.5 }}>
                  {idx + 1}. {step}
                </span>
                {idx < routeSteps.length - 1 && (
                  <span style={{ color: "var(--forest-muted)" }}>&rarr;</span>
                )}
              </span>
            ))}
          </div>
        </div>

        <div className="card-title" style={{ marginBottom: 16 }}>
          2. Program &amp; Intake Details
        </div>
        <div className="grid-2" style={{ marginBottom: 16 }}>
          <div>
            <label className="form-label">Program *</label>
            <select
              className="form-select"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
            >
              <option>Engineering &amp; Technology</option>
              <option>Management (MBA / PGDM)</option>
              <option>Pharmacy</option>
              <option>Computer Applications (MCA)</option>
              <option>Architecture &amp; Planning</option>
            </select>
          </div>

          <div>
            <label className="form-label">Proposed Intake (Seats) *</label>
            <input
              type="number"
              className="form-input"
              value={intake}
              onChange={(e) => setIntake(e.target.value)}
              style={{
                borderColor: intakeOk ? undefined : "var(--red)",
                background: intakeOk ? undefined : "var(--red-bg)",
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 6, flexWrap: "wrap" }}>
              <small style={{ color: intakeOk ? "var(--forest-muted)" : "var(--red)", fontWeight: 600 }}>
                {intakeOk ? "Multiple of 30 / 60" : "Must be a multiple of 30 / 60"}
              </small>
              <div style={{ display: "flex", gap: 4 }}>
                {["60", "120", "73"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setIntake(preset)}
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 9999,
                      border: "1px solid var(--border)",
                      background: preset === "73" ? "var(--red-bg)" : "var(--bg)",
                      color: preset === "73" ? "var(--red)" : "var(--forest)",
                      cursor: "pointer",
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grid-2" style={{ marginBottom: 16 }}>
          <div>
            <label className="form-label">Faculty Count *</label>
            <input
              type="number"
              className="form-input"
              value={faculty}
              onChange={(e) => setFaculty(e.target.value)}
              style={{
                borderColor: facultyOk || !intakeOk ? undefined : "var(--red)",
                background: facultyOk || !intakeOk ? undefined : "var(--red-bg)",
              }}
            />
            <small style={{ color: "var(--forest-muted)", display: "block", marginTop: 6 }}>
              Minimum {needFac || "—"} required (1:{APH_NORMS.facultyStudentRatio})
            </small>
          </div>
          <div>
            <label className="form-label">Course Title *</label>
            <input
              type="text"
              className="form-input"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
            />
          </div>
        </div>

        <div
          style={{
            padding: "12px 16px",
            borderRadius: 12,
            marginBottom: 20,
            background: gate.ok ? "var(--green-bg)" : "var(--amber-bg)",
            border: `1.5px solid ${gate.ok ? "var(--green-border)" : "var(--amber-border)"}`,
            color: gate.ok ? "var(--green)" : "var(--amber)",
          }}
        >
          <strong style={{ fontSize: 13 }}>{gate.title}</strong>
          <div style={{ fontSize: 12.5, marginTop: 2, color: "var(--forest)" }}>{gate.body}</div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label className="form-label">Remarks</label>
          <textarea
            className="form-textarea"
            rows={2}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Optional notes on infrastructure or faculty..."
          />
        </div>

        <div className="card-title" style={{ marginBottom: 12 }}>
          3. Attachment
        </div>
        <div
          style={{
            padding: 14,
            background: "var(--bg)",
            border: "1.5px dashed var(--border)",
            borderRadius: 12,
            marginBottom: 24,
          }}
        >
          <label className="form-label">DPR &amp; Infrastructure Affidavit (.pdf) *</label>
          <input
            type="file"
            accept=".pdf,application/pdf"
            className="form-input"
            onChange={handleFileSelect}
            style={{ padding: "8px 12px", background: "#fff" }}
          />
          <small style={{ color: fileName ? "var(--green)" : "var(--forest-muted)", display: "block", marginTop: 6, fontWeight: fileName ? 700 : 500 }}>
            {uploadingFile
              ? "Uploading PDF..."
              : fileName
                ? `Attached: ${fileName}`
                : "Select a PDF file from your computer to attach to this application."}
          </small>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
          <Link href="/dashboard" className="btn btn-secondary">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting || uploadingFile || intakeNum <= 0 || !Number.isInteger(intakeNum) || !fileName.trim()}
            className="btn btn-primary"
            style={{ minWidth: 160 }}
          >
            {submitting ? "Submitting..." : "Submit Application"}
          </button>
        </div>
      </form>
    </div>
  );
}
