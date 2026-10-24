// ============================================================
// AICTE Flow – Rules Configuration
// All values are ILLUSTRATIVE PLACEHOLDERS.
// Configure per the AICTE Approval Process Handbook (APH).
// These defaults are written to RuleConfig at seed time and
// read from the DB at runtime so an Admin can edit them.
// ============================================================

export const ROUTES = {
  ONLY_SCRUTINY:        ["SCRUTINY", "DECISION_PENDING"],
  SCRUTINY_EVC:         ["SCRUTINY", "EVC_QUEUE", "EVC_SCHEDULED", "EVC_REPORT", "DECISION_PENDING"],
  EVC_SAC_SHC:          ["EVC_QUEUE", "EVC_SCHEDULED", "EVC_REPORT", "SAC_SHC", "DECISION_PENDING"],
  ONLY_EVC:             ["EVC_QUEUE", "EVC_SCHEDULED", "EVC_REPORT", "DECISION_PENDING"],
  SCRUTINY_EVC_SAC_SHC: ["SCRUTINY", "EVC_QUEUE", "EVC_SCHEDULED", "EVC_REPORT", "SAC_SHC", "DECISION_PENDING"],
} as const;

export type RouteKey = keyof typeof ROUTES;

export const STAGES: Record<string, { label: string; ownerRole: string; timelineDays: number; subtitle?: string }> = {
  SCRUTINY:         { label: "Scrutiny",            ownerRole: "REGIONAL_OFFICER",  timelineDays: 15, subtitle: "Document & APH norm verification" },
  RE_SCRUTINY:      { label: "Re-Scrutiny",         ownerRole: "REGIONAL_OFFICER",  timelineDays: 7,  subtitle: "Review after institution reply" },
  EVC_QUEUE:        { label: "EVC Queue",           ownerRole: "REGIONAL_OFFICER",  timelineDays: 5,  subtitle: "Awaiting inspection scheduling" },
  EVC_SCHEDULED:    { label: "EVC Scheduled",       ownerRole: "EVC_COMMITTEE",     timelineDays: 20, subtitle: "Expert Visit (campus inspection)" },
  EVC_REPORT:       { label: "EVC Report Review",   ownerRole: "REGIONAL_OFFICER",  timelineDays: 7,  subtitle: "Inspection report review" },
  SAC_SHC:          { label: "SAC/SHC",             ownerRole: "SAC_SHC_MEMBER",    timelineDays: 10, subtitle: "Standing Appellate / Hearing Committee" },
  DECISION_PENDING: { label: "Decision Pending",    ownerRole: "BUREAU_OFFICER",    timelineDays: 10, subtitle: "Competent authority decision (human)" },
};

/** APH-style norms for assistive pass/fail checks (not auto-decisions). */
export const APH_NORMS = {
  facultyStudentRatio: 20, // 1:20
  cadreProfessor: 1,
  cadreAssociate: 2,
  cadreAssistant: 6,
  intakeMultiples: [30, 60] as number[],
  labAreaSqmPerStudent: 5, // illustrative built-up lab area heuristic for demo
  label: "AICTE APH-aligned norms (assistive; not a statutory decision)",
};

export const EVC_NEW_INSTITUTION_DAYS = 30;

// Application type → route mapping (editable by Admin via RuleConfig)
export const APP_TYPE_ROUTE_MAP: Record<string, RouteKey> = {
  NEW_INSTITUTION:  "SCRUTINY_EVC_SAC_SHC",
  NEW_COURSE:       "SCRUTINY_EVC",
  EXTENSION:        "ONLY_SCRUTINY",
  INTAKE_INCREASE:  "SCRUTINY_EVC",
  CLOSURE:          "ONLY_SCRUTINY",
  /** Direct campus verification without preliminary scrutiny (APH Only-EVC combination). */
  OTHER:            "ONLY_EVC",
};

export const RESPONSE_WINDOW_DAYS = 7; // when application is returned to institution

export const ALERT_RULES: Record<string, {
  reminders: number[];
  overdueEveryDays: number;
  escalate: { afterOverdueDays: number; level: number }[];
}> = {
  STAGE_TIMELINE:  { reminders: [-3, -1, 0], overdueEveryDays: 2, escalate: [{ afterOverdueDays: 1, level: 1 }, { afterOverdueDays: 5, level: 2 }, { afterOverdueDays: 10, level: 3 }] },
  EVC_SCHEDULING:  { reminders: [-2, 0],     overdueEveryDays: 2, escalate: [{ afterOverdueDays: 1, level: 1 }, { afterOverdueDays: 4, level: 2 }] },
  EVC_COMPLETION:  { reminders: [-7, -3, 0], overdueEveryDays: 3, escalate: [{ afterOverdueDays: 2, level: 1 }, { afterOverdueDays: 7, level: 2 }] },
  UNDERTAKING:     { reminders: [-30, -15, -7, -1, 0], overdueEveryDays: 7,  escalate: [{ afterOverdueDays: 1, level: 1 }, { afterOverdueDays: 15, level: 2 }, { afterOverdueDays: 30, level: 3 }] },
  DOCUMENT_EXPIRY: { reminders: [-90, -60, -30, -7, 0], overdueEveryDays: 7, escalate: [{ afterOverdueDays: 1, level: 1 }, { afterOverdueDays: 15, level: 2 }, { afterOverdueDays: 30, level: 3 }] },
};
