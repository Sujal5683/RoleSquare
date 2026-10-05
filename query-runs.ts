import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const runs = await db.sourceRun.findMany({
    orderBy: { startedAt: 'desc' },
    take: 5
  });
  console.dir(runs, { depth: null });
}

main().catch(console.error).finally(() => db.$disconnect());
