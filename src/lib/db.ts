import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Auto-patch Supabase connection pooler URLs to require pgbouncer=true
// This prevents the 'prepared statement "sX" already exists' (42P05) crash in Vercel
let databaseUrl = process.env.DATABASE_URL;
if (databaseUrl && databaseUrl.includes("pooler.supabase.com") && !databaseUrl.includes("pgbouncer=true")) {
  databaseUrl += databaseUrl.includes("?") ? "&pgbouncer=true" : "?pgbouncer=true";
  // Mutate process.env directly so the Prisma engine picks up the flag on init.
  // Passing it via `datasources: { db: { url } }` ignores engine-level flags like pgbouncer.
  process.env.DATABASE_URL = databaseUrl;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

