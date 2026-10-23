import { differenceInCalendarDays } from "date-fns";

type StageRow = {
  stageKey: string;
  enteredAt: Date;
  exitedAt: Date | null;
  outcome: string | null;
};

/**
 * Dual accountability: AICTE officer processing days vs institution deficiency-response days.
 * Institution time = gaps after RETURNED outcomes until next stage entry, plus open RETURNED status.
 */
export function computeDualClock(
  stages: StageRow[],
  status: string,
  stageEnteredAt: Date,
  now: Date
): { officerDays: number; institutionDays: number } {
  let officerDays = 0;
  let institutionDays = 0;

  const sorted = [...stages].sort(
    (a, b) => a.enteredAt.getTime() - b.enteredAt.getTime()
  );

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const end = s.exitedAt ?? (status !== "RETURNED" ? now : s.enteredAt);
    const days = Math.max(0, differenceInCalendarDays(end, s.enteredAt));

    if (s.outcome === "RETURNED" && s.exitedAt) {
      officerDays += days;
      const next = sorted[i + 1];
      const instEnd = next?.enteredAt ?? (status === "RETURNED" ? now : s.exitedAt);
      institutionDays += Math.max(0, differenceInCalendarDays(instEnd, s.exitedAt));
    } else if (status === "RETURNED" && !s.exitedAt) {
      // Open response window — count toward institution, not officer
      institutionDays += Math.max(0, differenceInCalendarDays(now, s.enteredAt));
    } else {
      officerDays += days;
    }
  }

  // No stage rows yet: attribute open clock by status
  if (sorted.length === 0) {
    const open = Math.max(0, differenceInCalendarDays(now, stageEnteredAt));
    if (status === "RETURNED") institutionDays += open;
    else officerDays += open;
  } else if (status === "RETURNED") {
    // If last closed stage was RETURNED but no open stage row for response
    const last = sorted[sorted.length - 1];
    if (last.exitedAt && last.outcome === "RETURNED") {
      const already = institutionDays;
      const fromReturn = Math.max(0, differenceInCalendarDays(now, last.exitedAt));
      if (fromReturn > already) institutionDays = fromReturn;
    }
  }

  return { officerDays, institutionDays };
}
