import { ROUTES } from "../../config/rules";
import { prisma } from "../db";

/** Ordered stages for a route key (empty if unknown). */
export function getRouteStages(route: string): readonly string[] {
  return (ROUTES as Record<string, readonly string[]>)[route] ?? [];
}

/** Ordered route stages from RuleConfig, falling back to the checked-in catalogue. */
export async function getConfiguredRouteStages(route: string): Promise<readonly string[]> {
  try {
    const config = await prisma.ruleConfig.findUnique({ where: { key: "ROUTES" } });
    if (config) {
      const routes = JSON.parse(config.value) as Record<string, unknown>;
      const stages = routes[route];
      if (Array.isArray(stages) && stages.every((stage) => typeof stage === "string")) {
        return stages;
      }
    }
  } catch {}
  return getRouteStages(route);
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

export async function getConfiguredNextStage(route: string, currentStage: string): Promise<string | null> {
  const stages = await getConfiguredRouteStages(route);
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
