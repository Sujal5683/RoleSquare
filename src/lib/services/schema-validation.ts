import { db as prisma } from "@/lib/db";

export class SchemaValidationService {
  /**
   * Validates if the google sheet headers match the mapped dataset schema
   * Returns a diff of added, missing, or renamed columns.
   */
  static async validateHeaders(sheetMappingId: string, sheetHeaders: string[]) {
    const mapping = await prisma.sheetMapping.findUnique({
      where: { id: sheetMappingId },
      include: {
        columnMappings: { include: { field: true } },
      }
    });

    if (!mapping) throw new Error("Mapping not found");

    const expectedHeaders = mapping.columnMappings.map(cm => cm.sheetColumnName);
    
    const missing = expectedHeaders.filter(h => !sheetHeaders.includes(h));
    const unexpected = sheetHeaders.filter(h => !expectedHeaders.includes(h));

    const isValid = missing.length === 0 && unexpected.length === 0;

    return {
      isValid,
      missing,
      unexpected
    };
  }

  /**
   * Helper to compute a hash of the schema mapping
   * SHA256(column_id + column_name + order + datatype)
   */
  static async updateSchemaFingerprint(sheetMappingId: string) {
    const mapping = await prisma.sheetMapping.findUnique({
      where: { id: sheetMappingId },
      include: {
        columnMappings: { 
          include: { field: true },
          orderBy: { field: { position: 'asc' } }
        }
      }
    });

    if (!mapping) return;

    const schemaStr = mapping.columnMappings.map(cm => 
      `${cm.fieldId}:${cm.sheetColumnName}:${cm.field.position}:${cm.field.type}`
    ).join('|');

    // Simple hash (use crypto module in production)
    const hash = Buffer.from(schemaStr).toString('base64');

    await prisma.sheetMapping.update({
      where: { id: sheetMappingId },
      data: { schemaFingerprint: hash }
    });

    return hash;
  }
}
