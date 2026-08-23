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

// Force re-compilation of Prisma Client types in Next.js dev server
// Start the in-process job runner. This ensures queued/running jobs are
// processed even in the Next.js dev server environment. The runner is
// lazy — it only starts on first import and polls every 5 seconds.
// We avoid starting it during `next build` to prevent DB connection errors.
if (
  typeof window === "undefined" &&
  process.env.npm_lifecycle_event !== "build" &&
  !process.env.NEXT_PHASE?.includes("build") &&
  process.env.NODE_ENV !== "test"
) {
  // Only run on the server side, but not during build
  import("./job-runner")
    .then(({ ensureJobRunnerStarted }) => {
      ensureJobRunnerStarted();
    })
    .catch((err) => {
      console.error("[db] failed to start job runner:", err);
    });
}
