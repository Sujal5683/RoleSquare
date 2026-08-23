import { PrismaClient } from '@prisma/client';
import { getGmailClient } from "./src/lib/google-client";

const prisma = new PrismaClient();

async function main() {
  const source = await prisma.source.findFirst();
  if (!source) throw new Error("No source");

  console.log("Calling first time...");
  const t1 = Date.now();
  const gmail1 = await getGmailClient(source.googleConnectionId!);
  const res1 = await gmail1.users.messages.list({ userId: "me", maxResults: 10 });
  console.log(`First call success: ${res1.data.messages?.length} messages in ${Date.now() - t1}ms`);

  console.log("Waiting 6 seconds (letting keep-alive drop)...");
  await new Promise(r => setTimeout(r, 6000));

  console.log("Calling second time...");
  const t2 = Date.now();
  try {
    const gmail2 = await getGmailClient(source.googleConnectionId!);
    const res2 = await gmail2.users.messages.list({ userId: "me", maxResults: 10 });
    console.log(`Second call success: ${res2.data.messages?.length} messages in ${Date.now() - t2}ms`);
  } catch (err) {
    console.error("Second call failed:", err);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
