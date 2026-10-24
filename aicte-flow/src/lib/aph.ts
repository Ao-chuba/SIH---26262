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
  /** Illustrative APH handbook clause reference for demo */
  clause: string;
};

export function isValidIntake(intake: number): boolean {
  return (
    Number.isInteger(intake) &&
    intake > 0 &&
    APH_NORMS.intakeMultiples.some((m) => intake % m === 0)
  );
}

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
  const safeIntake = isValidIntake(intake) ? intake : 60;
  const req = requiredFaculty(safeIntake);
  const facultyCount = compliant ? Math.max(req, Math.ceil(req * 1.1)) : Math.max(1, req - 2);
  const units = Math.max(1, Math.floor(facultyCount / 9));
  const professors = compliant ? units * APH_NORMS.cadreProfessor : 0;
  const associates = compliant ? units * APH_NORMS.cadreAssociate : Math.max(0, units);
  const assistants = Math.max(0, facultyCount - professors - associates);
  const requiredLabAreaSqm = Math.ceil(safeIntake * APH_NORMS.labAreaSqmPerStudent);
  const labAreaSqm = compliant
    ? requiredLabAreaSqm + 40
    : Math.max(50, requiredLabAreaSqm - 80);

  return {
    studentIntake: compliant ? safeIntake : isValidIntake(intake) ? intake : 73,
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
  const intakeOk = isValidIntake(metrics.studentIntake);
  const cadreOk =
    metrics.professors >= 1 &&
    metrics.associates >= metrics.professors * APH_NORMS.cadreAssociate &&
    metrics.assistants >= metrics.professors * APH_NORMS.cadreAssistant;
  const labOk = metrics.labAreaSqm >= metrics.requiredLabAreaSqm;

  return [
    {
      key: "ratio",
      label: "Faculty–Student Ratio",
      detail: `${metrics.facultyCount} faculty for ${metrics.studentIntake} intake (minimum ${reqFac} required at 1:${APH_NORMS.facultyStudentRatio})`,
      pass: ratioOk,
      clause: "APH Ch. 7 · Faculty:Student ≥ 1:20",
    },
    {
      key: "intake",
      label: "Intake Division",
      detail: `${metrics.studentIntake} seats (division of ${APH_NORMS.intakeMultiples.join(" / ")})`,
      pass: intakeOk,
      clause: "APH Ch. 3 · Standard Intake Divisions (30 / 60)",
    },
    {
      key: "cadre",
      label: "Cadre Ratio (1:2:6)",
      detail: `Prof ${metrics.professors} · Assoc ${metrics.associates} · Asst ${metrics.assistants}`,
      pass: cadreOk,
      clause: "APH Ch. 7 · Cadre Ratio 1 : 2 : 6",
    },
    {
      key: "lab",
      label: "Instructional & Lab Area",
      detail: `${metrics.labAreaSqm} sq.m available vs ${metrics.requiredLabAreaSqm} sq.m required`,
      pass: labOk,
      clause: "APH Annexure · Built-up Instructional & Lab Area",
    },
  ];
}

/** 0–100 score from APH checks (equal weight). */
export function aphScore(metrics: AphMetrics | null): number {
  if (!metrics) return 0;
  const checks = evaluateAph(metrics);
  const pass = checks.filter((c) => c.pass).length;
  return Math.round((pass / checks.length) * 100);
}

/** Draft deficiency observation text from failed APH checks (assistive; officer edits before save). */
export function formatAphDeficiencies(metrics: AphMetrics | null): string {
  if (!metrics) return "";
  const fails = evaluateAph(metrics).filter((c) => !c.pass);
  if (fails.length === 0) return "";
  return fails
    .map((c) => `Deficiency — ${c.label}: ${c.detail} (${c.clause})`)
    .join("\n");
}

export type HealthBreakdown = {
  score: number;
  aphScore: number;
  docsScore: number;
  undertakingsScore: number;
  label: "CRITICAL" | "AT RISK" | "HEALTHY";
};

/**
 * Institution year-round compliance health: APH metrics (latest app) +
 * document validity + undertaking status. Assistive only.
 */
export function computeHealthScore(input: {
  metricsJson?: string | null;
  docs: { status: string; validUntil: Date }[];
  undertakings: { status: string }[];
  now: Date;
}): HealthBreakdown {
  const metrics = parseMetrics(input.metricsJson ?? null);
  const aScore = aphScore(metrics);

  let docsScore = 100;
  if (input.docs.length === 0) {
    docsScore = 70;
  } else {
    const weights: number[] = input.docs.map((d) => {
      if (d.status === "EXPIRED" || d.validUntil < input.now) return 0;
      if (d.status === "EXPIRING" || d.status === "RENEWAL_SUBMITTED") return 50;
      return 100;
    });
    docsScore = Math.round(weights.reduce((a, b) => a + b, 0) / weights.length);
  }

  let undertakingsScore = 100;
  if (input.undertakings.length > 0) {
    const weights: number[] = input.undertakings.map((u) => {
      if (u.status === "OVERDUE" || u.status === "REJECTED") return 0;
      if (u.status === "PENDING" || u.status === "SUBMITTED") return 60;
      return 100;
    });
    undertakingsScore = Math.round(weights.reduce((a, b) => a + b, 0) / weights.length);
  }

  const score = Math.round(aScore * 0.45 + docsScore * 0.35 + undertakingsScore * 0.2);
  const label = score < 50 ? "CRITICAL" : score < 75 ? "AT RISK" : "HEALTHY";
  return { score, aphScore: aScore, docsScore, undertakingsScore, label };
}
