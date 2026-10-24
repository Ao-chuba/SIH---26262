import { ROUTES } from "../../config/rules";

/** Ordered stages for a route key (empty if unknown). */
export function getRouteStages(route: string): readonly string[] {
  return (ROUTES as Record<string, readonly string[]>)[route] ?? [];
}

/**
 * Next stage along the configured route.
 * RE_SCRUTINY is treated as SCRUTINY for progression.
 */
export function getNextStage(route: string, currentStage: string): string | null {
  const stages = getRouteStages(route);
  const normalized = currentStage === "RE_SCRUTINY" ? "SCRUTINY" : currentStage;
  const idx = stages.indexOf(normalized);
  if (idx === -1 || idx >= stages.length - 1) return null;
  return stages[idx + 1];
}

/** True when the route list includes the stage (RE_SCRUTINY counts as SCRUTINY). */
export function routeHasStage(route: string, stage: string): boolean {
  const stages = getRouteStages(route);
  const key = stage === "RE_SCRUTINY" ? "SCRUTINY" : stage;
  return stages.includes(key);
}
