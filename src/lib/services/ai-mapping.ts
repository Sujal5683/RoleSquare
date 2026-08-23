import { db as prisma } from "@/lib/db";

export class ColumnMappingService {
  /**
   * AI-powered column mapping.
   * Compares incoming Google Sheet headers with existing application schema fields.
   * Suggests mappings with confidence scores.
   */
  static async suggestMappings(datasetId: string, sheetHeaders: string[]) {
    const dataset = await prisma.dataset.findUnique({
      where: { id: datasetId },
      include: { schema: { include: { fields: true } } }
    });

    if (!dataset || !dataset.schema) {
      throw new Error("Dataset or Schema not found");
    }

    const fields = dataset.schema.fields;
    
    // In a production environment, this would call out to Gemini via the AIJob system
    // e.g. await AiJob.create({ type: 'COLUMN_MAPPING', ... })
    // For this implementation, we simulate basic semantic matching.
    
    const suggestions = sheetHeaders.map(header => {
      // Basic normalization
      const normalizedHeader = header.toLowerCase().replace(/[^a-z0-9]/g, '');
      
      let bestMatch: any = null;
      let highestScore = 0;

      for (const field of fields) {
        const normalizedField = field.name.toLowerCase().replace(/[^a-z0-9]/g, '');
        
        // Exact match
        if (normalizedHeader === normalizedField) {
          bestMatch = field;
          highestScore = 1.0;
          break;
        }

        // Substring / partial match (very basic)
        if (normalizedHeader.includes(normalizedField) || normalizedField.includes(normalizedHeader)) {
          if (highestScore < 0.8) {
            bestMatch = field;
            highestScore = 0.8;
          }
        }
      }

      return {
        sheetColumnName: header,
        suggestedFieldId: bestMatch?.id || null,
        suggestedFieldName: bestMatch?.name || null,
        confidence: highestScore
      };
    });

    return suggestions;
  }
}
