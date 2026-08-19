import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Start the in-process job runner. This ensures queued/running jobs are
// processed even in the Next.js dev server environment. The runner is
// lazy — it only starts on first import and polls every 5 seconds.
if (typeof window === "undefined") {
  // Only run on the server side
  import("./job-runner")
    .then(({ ensureJobRunnerStarted }) => {
      ensureJobRunnerStarted();
    })
    .catch((err) => {
      console.error("[db] failed to start job runner:", err);
    });
}
