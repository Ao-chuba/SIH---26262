// ============================================================
// AICTE Flow – UI Display Formatters
// Converts database enum codes into clean Title Case labels
// ============================================================

export const APP_TYPE_LABELS: Record<string, string> = {
  NEW_INSTITUTION: "New Institution",
  NEW_COURSE: "New Course",
  EXTENSION: "Extension of Approval (EoA)",
  INTAKE_INCREASE: "Intake Increase",
  CLOSURE: "Program Closure",
  OTHER: "Other Approval",
};

export const ROUTE_LABELS: Record<string, string> = {
  ONLY_SCRUTINY: "Scrutiny Only",
  SCRUTINY_EVC: "Scrutiny + EVC",
  EVC_SAC_SHC: "EVC + SAC/SHC",
  ONLY_EVC: "Direct EVC",
  SCRUTINY_EVC_SAC_SHC: "Scrutiny + EVC + SAC/SHC",
};

export const STAGE_LABELS: Record<string, string> = {
  SCRUTINY: "Scrutiny",
  RE_SCRUTINY: "Re-Scrutiny",
  EVC_QUEUE: "EVC Queue",
  EVC_SCHEDULED: "EVC Scheduled",
  EVC_REPORT: "EVC Report Review",
  SAC_SHC: "SAC / SHC Hearing",
  DECISION_PENDING: "Decision Pending",
};

export const STATUS_LABELS: Record<string, string> = {
  IN_PROGRESS: "In Progress",
  RETURNED: "Returned",
  COMPLETED: "Completed",
  DECIDED: "Decided",
  QUEUED: "Queued",
  SCHEDULED: "Scheduled",
  PENDING: "Pending",
  SUBMITTED: "Submitted",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  OVERDUE: "Overdue",
  CLOSED: "Closed",
  VALID: "Valid",
  EXPIRING: "Expiring Soon",
  EXPIRED: "Expired",
  RENEWAL_SUBMITTED: "Renewal Submitted",
  RENEWAL_VERIFIED: "Renewal Verified",
  RENEWAL_REJECTED: "Renewal Rejected",
  OPEN: "Open",
  SATISFIED: "Satisfied",
  CANCELLED: "Cancelled",
  APPROVED: "Approved",
  APPROVED_WITH_CONDITIONS: "Approved with Conditions",
  DEFERRED: "Deferred",
  REMINDER: "Reminder",
  ESCALATION: "Escalation",
  INFO: "Notice",
  RETURN: "Deficiency Return",
  OBSERVATION: "Observation",
  CLARIFICATION: "Clarification",
  DEFICIENCY: "Deficiency",
  REPLY: "Institution Reply",
  INAPP: "In-App",
  EMAIL: "Email",
  SMS: "SMS",
};

export const DEADLINE_KIND_LABELS: Record<string, string> = {
  STAGE_TIMELINE: "Stage Timeline",
  EVC_SCHEDULING: "EVC Scheduling",
  EVC_COMPLETION: "EVC Completion",
  UNDERTAKING: "Undertaking",
  DOCUMENT_EXPIRY: "Document Expiry",
};

export const DOC_TYPE_LABELS: Record<string, string> = {
  LAND_LEASE: "Land Lease Deed",
  LEASE: "Land Lease Deed",
  BUILDING_PLAN: "Building Plan Approval",
  BUILDING_STABILITY: "Building Stability Certificate",
  FIRE_SAFETY: "Fire Safety NOC",
  NOC: "Statutory NOC",
  LAND_USE: "Land Use Certificate",
  AFFILIATION: "University Affiliation",
  ACCREDITATION: "NBA / NAAC Accreditation",
  OTHER: "Compliance Document",
};

export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "System Admin",
  BUREAU_OFFICER: "Bureau Officer",
  REGIONAL_OFFICER: "Regional Officer",
  EVC_COMMITTEE: "EVC Committee",
  SAC_SHC_MEMBER: "SAC / SHC Member",
  INSTITUTION: "Institution",
  SYSTEM: "System Engine",
};

export const OUTCOME_LABELS: Record<string, string> = {
  ADVANCED: "Advanced",
  RETURNED: "Returned",
  REFERRED_SAC_SHC: "Referred to SAC/SHC",
  DECIDED: "Decided",
};

function fallbackTitleCase(raw: string): string {
  return raw
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bEvc\b/g, "EVC")
    .replace(/\bSac\b/g, "SAC")
    .replace(/\bShc\b/g, "SHC")
    .replace(/\bNoc\b/g, "NOC")
    .replace(/\bSla\b/g, "SLA")
    .replace(/\bAph\b/g, "APH");
}

export function formatAppType(key: string): string {
  return APP_TYPE_LABELS[key] ?? fallbackTitleCase(key);
}

export function formatRoute(key: string): string {
  return ROUTE_LABELS[key] ?? fallbackTitleCase(key);
}

export function formatStage(key: string): string {
  return STAGE_LABELS[key] ?? fallbackTitleCase(key);
}

export function formatStatus(key: string): string {
  return STATUS_LABELS[key] ?? fallbackTitleCase(key);
}

export function formatDeadlineKind(key: string): string {
  return DEADLINE_KIND_LABELS[key] ?? fallbackTitleCase(key);
}

export function formatDocType(key: string): string {
  return DOC_TYPE_LABELS[key] ?? fallbackTitleCase(key);
}

export function formatRole(key: string | null | undefined): string {
  if (!key) return "System";
  return ROLE_LABELS[key] ?? fallbackTitleCase(key);
}

export function formatOutcome(key: string | null | undefined): string {
  if (!key) return "";
  return OUTCOME_LABELS[key] ?? fallbackTitleCase(key);
}

export function formatAction(key: string): string {
  return fallbackTitleCase(key);
}

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  Application: "Application",
  InstDocument: "Document / Lease",
  Undertaking: "Undertaking",
  EvcVisit: "EVC Visit",
  DeadlineItem: "Deadline Item",
  RuleConfig: "Rule Config",
  AuditLog: "Audit Ledger",
  SystemClock: "System Clock",
  User: "User Session",
  System: "System",
};

export function formatEntityType(key: string): string {
  return ENTITY_TYPE_LABELS[key] ?? fallbackTitleCase(key);
}
