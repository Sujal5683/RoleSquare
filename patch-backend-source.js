const fs = require('fs');
const filePath = 'src/app/api/ai/extract-wizard/route.ts';
let content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');

const oldBlock = `    // Verify source dataset exists and belongs to org
    const sourceDataset = await db.dataset.findUnique({
      where: { id: sourceDatasetId },
      select: { id: true, organizationId: true, name: true, recordCount: true },
    });
    if (!sourceDataset || sourceDataset.organizationId !== organizationId) {
      return NextResponse.json({ error: "Source dataset not found" }, { status: 404 });
    }`;

const newBlock = `    // Verify source dataset exists and belongs to org
    const sourceDataset = await db.dataset.findUnique({
      where: { id: sourceDatasetId },
      select: { id: true, organizationId: true, name: true, recordCount: true },
    });
    if (!sourceDataset || sourceDataset.organizationId !== organizationId) {
      return NextResponse.json({ error: "Source dataset not found" }, { status: 404 });
    }

    const { verifyDatasetWriteAccess } = await import("@/lib/dataset-access");
    const canEditSource = await verifyDatasetWriteAccess(sourceDatasetId, user.id, organizationId);
    if (!canEditSource) {
      return NextResponse.json({ error: "You do not have write access to the source dataset." }, { status: 403 });
    }`;

if (content.includes(oldBlock)) {
    content = content.replace(oldBlock, newBlock);
    fs.writeFileSync(filePath, content);
    console.log('Patched backend source dataset access check');
} else {
    console.log('Backend block not found');
}
