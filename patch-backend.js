const fs = require('fs');
const filePath = 'src/app/api/ai/extract-wizard/route.ts';
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

const oldBlock = `    // Resolve or create the target dataset
    if (targetDatasetId) {
      const existing = await db.dataset.findUnique({
        where: { id: targetDatasetId },
        select: { id: true, organizationId: true },
      });
      if (!existing || existing.organizationId !== organizationId) {
        return NextResponse.json({ error: "Target dataset not found" }, { status: 404 });
      }
    } else {`;

const newBlock = `    // Resolve or create the target dataset
    if (targetDatasetId) {
      const { verifyDatasetWriteAccess } = await import("@/lib/dataset-access");
      const canEdit = await verifyDatasetWriteAccess(targetDatasetId, user.id, organizationId);
      if (!canEdit) {
        return NextResponse.json({ error: "You do not have write access to the target dataset." }, { status: 403 });
      }
    } else {`;

if (content.includes(oldBlock)) {
    content = content.replace(oldBlock, newBlock);
    fs.writeFileSync(filePath, content);
    console.log('Patched');
} else {
    console.log('Not found');
}
