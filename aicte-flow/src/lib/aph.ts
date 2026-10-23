import { APH_NORMS } from "@/config/rules";

export type AphMetrics = {
  studentIntake: number;
  facultyCount: number;
  professors: number;
  associates: number;
  assistants: number;
  labAreaSqm: number;
  requiredLabAreaSqm: number;
};

export type AphCheck = {
  key: string;
  label: string;
  detail: string;
  pass: boolean;
};

export function parseMetrics(json: string | null | undefined): AphMetrics | null {
  if (!json) return null;
  try {
    const m = JSON.parse(json) as Partial<AphMetrics>;
    if (typeof m.studentIntake !== "number" || typeof m.facultyCount !== "number") return null;
    return {
      studentIntake: m.studentIntake,
      facultyCount: m.facultyCount,
      professors: m.professors ?? 0,
      associates: m.associates ?? 0,
      assistants: m.assistants ?? 0,
      labAreaSqm: m.labAreaSqm ?? 0,
      requiredLabAreaSqm:
        m.requiredLabAreaSqm ?? Math.ceil(m.studentIntake * APH_NORMS.labAreaSqmPerStudent),
    };
  } catch {
    return null;
  }
}

export function requiredFaculty(intake: number): number {
  return Math.ceil(intake / APH_NORMS.facultyStudentRatio);
}

/** Build demo/default metrics. Set `compliant` false to seed a deficiency case. */
export function buildMetrics(intake: number, compliant = true): AphMetrics {
  const safeIntake =
    APH_NORMS.intakeMultiples.includes(intake) || intake % 30 === 0 ? intake : 60;
  const req = requiredFaculty(safeIntake);
  const facultyCount = compliant ? Math.max(req, Math.ceil(req * 1.1)) : Math.max(1, req - 2);
  // Scale cadre roughly 1:2:6 of faculty units
  const units = Math.max(1, Math.floor(facultyCount / 9));
  const professors = compliant ? units * APH_NORMS.cadreProfessor : 0;
  const associates = compliant ? units * APH_NORMS.cadreAssociate : Math.max(0, units);
  const assistants = Math.max(0, facultyCount - professors - associates);
  const requiredLabAreaSqm = Math.ceil(safeIntake * APH_NORMS.labAreaSqmPerStudent);
  const labAreaSqm = compliant
    ? requiredLabAreaSqm + 40
    : Math.max(50, requiredLabAreaSqm - 80);

  return {
    studentIntake: compliant ? safeIntake : intake % 30 === 0 ? intake : 73,
    facultyCount,
    professors,
    associates,
    assistants,
    labAreaSqm,
    requiredLabAreaSqm,
  };
}

export function evaluateAph(metrics: AphMetrics): AphCheck[] {
  const reqFac = requiredFaculty(metrics.studentIntake);
  const ratioOk = metrics.facultyCount >= reqFac;
  const intakeOk =
    metrics.studentIntake > 0 &&
    APH_NORMS.intakeMultiples.some((m) => metrics.studentIntake % m === 0);
  const cadreTotal =
    metrics.professors * 1 + metrics.associates * 1 + metrics.assistants * 1;
  // Cadre 1:2:6 — check proportions when we have at least one professor unit
  const cadreOk =
    metrics.professors >= 1 &&
    metrics.associates >= metrics.professors * APH_NORMS.cadreAssociate &&
    metrics.assistants >= metrics.professors * APH_NORMS.cadreAssistant;
  const labOk = metrics.labAreaSqm >= metrics.requiredLabAreaSqm;

  return [
    {
      key: "ratio",
      label: "Faculty–Student Ratio",
      detail: `${metrics.facultyCount} faculty for ${metrics.studentIntake} intake (need ≥ ${reqFac} at 1:${APH_NORMS.facultyStudentRatio})`,
      pass: ratioOk,
    },
    {
      key: "intake",
      label: "Intake Multiple",
      detail: `${metrics.studentIntake} seats (must be multiple of ${APH_NORMS.intakeMultiples.join(" / ")})`,
      pass: intakeOk,
    },
    {
      key: "cadre",
      label: "Cadre Ratio (1:2:6)",
      detail: `Prof ${metrics.professors} : Assoc ${metrics.associates} : Asst ${metrics.assistants}${cadreTotal === 0 ? " (no cadre data)" : ""}`,
      pass: cadreOk,
    },
    {
      key: "lab",
      label: "Lab Built-up Area",
      detail: `${metrics.labAreaSqm} sq.m vs required ${metrics.requiredLabAreaSqm} sq.m (illustrative)`,
      pass: labOk,
    },
  ];
}
