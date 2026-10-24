import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  sqliteTuned?: boolean;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

if (!globalForPrisma.sqliteTuned) {
  globalForPrisma.sqliteTuned = true;
  void prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL");
  void prisma.$executeRawUnsafe("PRAGMA busy_timeout=15000");
}

export function runTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(fn, { maxWait: 15_000, timeout: 20_000 });
}
