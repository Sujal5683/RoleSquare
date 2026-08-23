import { ensureOrgDefaultDataset } from "./src/lib/dataset-provisioner";
import { db } from "./src/lib/db";

async function main() {
  try {
    const orgs = await db.organization.findMany();
    console.log("Orgs:", orgs.length);
    for (const org of orgs) {
      console.log("Processing org:", org.id);
      const dsId = await ensureOrgDefaultDataset(org.id, org.createdBy);
      console.log("Result:", dsId);
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await db.$disconnect();
  }
}

main();
