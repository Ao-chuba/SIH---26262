import { prisma } from "./db";

/**
 * Returns the current time, using the simulated clock if active.
 * All business logic MUST call getNow() instead of new Date().
 */
export async function getNow(): Promise<Date> {
  try {
    const clock = await prisma.systemClock.findUnique({ where: { id: 1 } });
    if (clock?.simulatedNow) return new Date(clock.simulatedNow);
  } catch {
    // If DB not ready, fall back to real time
  }
  return new Date();
}

export async function setSimulatedNow(date: Date | null): Promise<void> {
  await prisma.systemClock.upsert({
    where: { id: 1 },
    create: { id: 1, simulatedNow: date },
    update: { simulatedNow: date },
  });
}

export async function addDaysToSimulated(days: number): Promise<Date> {
  const now = await getNow();
  const newDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  await setSimulatedNow(newDate);
  return newDate;
}

export async function isSimulating(): Promise<boolean> {
  const clock = await prisma.systemClock.findUnique({ where: { id: 1 } });
  return !!clock?.simulatedNow;
}
