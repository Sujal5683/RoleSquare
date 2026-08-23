import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const res = await prisma.source.updateMany({
    where: { runState: { not: 'idle' } },
    data: { runState: 'idle' }
  });
  console.log(`Reset ${res.count} sources to idle`);
  
  const res2 = await prisma.sourceRun.updateMany({
    where: { status: 'running' },
    data: { status: 'failed', errorMessage: 'Job timed out (stale)' }
  });
  console.log(`Failed ${res2.count} runs`);
  
  const res3 = await prisma.aiJob.updateMany({
    where: { status: 'running' },
    data: { status: 'failed', errorMessage: 'Job timed out (stale)', finishedAt: new Date() }
  });
  console.log(`Failed ${res3.count} jobs`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
