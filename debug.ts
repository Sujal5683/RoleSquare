import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// Mock cookies for Next.js
jest.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => ({ value: "true" }),
    getAll: () => []
  })
}));

async function run() {
  try {
    const user = await db.user.findFirst();
    console.log("DB User:", !!user);
    if (user) {
      const authUser = await getCurrentUser(true);
      console.log("Auth User:", authUser.email);
    }
  } catch(e) {
    console.error("DEBUG ERROR:", e);
  }
}
run();
