import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Auto-patch Supabase connection pooler URLs to require pgbouncer=true
// This prevents the 'prepared statement "sX" already exists' (42P05) crash in Vercel
let databaseUrl = process.env.DATABASE_URL;
if (databaseUrl && databaseUrl.includes("pooler.supabase.com") && !databaseUrl.includes("pgbouncer=true")) {
  databaseUrl += databaseUrl.includes("?") ? "&pgbouncer=true" : "?pgbouncer=true";
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error", "warn"],
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

