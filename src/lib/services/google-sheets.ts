import { google, sheets_v4 } from "googleapis";
import { GoogleOAuthService } from "./google-oauth";

export class GoogleSheetsService {
  /**
   * Returns an authenticated Sheets API client for the given integration.
   */
  static async getSheetsClient(integrationId: string) {
    const auth = await GoogleOAuthService.getAuthenticatedClient(integrationId);
    return google.sheets({ version: "v4", auth });
  }

  /**
   * Fetches metadata for a spreadsheet, including all its sheets (tabs).
   */
  static async getSpreadsheetMetadata(integrationId: string, spreadsheetId: string) {
    const sheets = await this.getSheetsClient(integrationId);
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
    });
    return response.data;
  }

  /**
   * Fetches the headers (first row) of a specific sheet tab.
   */
  static async getSheetHeaders(integrationId: string, spreadsheetId: string, sheetName: string) {
    const sheets = await this.getSheetsClient(integrationId);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!1:1`,
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows[0] as string[];
  }

  /**
   * Fetches data from a specific sheet, starting from the second row.
   */
  static async getSheetData(integrationId: string, spreadsheetId: string, sheetName: string) {
    const sheets = await this.getSheetsClient(integrationId);
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: sheetName,
      valueRenderOption: "UNFORMATTED_VALUE",
    });

    const rows = response.data.values;
    if (!rows || rows.length <= 1) {
      return { headers: [], data: [] };
    }

    const headers = rows[0] as string[];
    const data = rows.slice(1);
    
    return { headers, data };
  }

  /**
   * Protects the header row of a sheet so users cannot easily break the schema.
   */
  static async protectHeaderRow(integrationId: string, spreadsheetId: string, sheetId: number) {
    const sheets = await this.getSheetsClient(integrationId);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            addProtectedRange: {
              protectedRange: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                description: "Protected Headers - Managed by Application",
                warningOnly: true, // we just warn them if they edit it manually
              },
            },
          },
        ],
      },
    });
  }

  /**
   * Appends rows to a sheet.
   */
  static async appendRows(integrationId: string, spreadsheetId: string, sheetName: string, values: any[][]) {
    const sheets = await this.getSheetsClient(integrationId);
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: sheetName,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values,
      },
    });
  }

  /**
   * Overwrites the values in a sheet, clearing it first if necessary, or just updating the range.
   */
  static async updateSheetValues(integrationId: string, spreadsheetId: string, sheetName: string, values: any[][]) {
    const sheets = await this.getSheetsClient(integrationId);
    
    // First, clear the existing data to avoid leftover rows if the new dataset is smaller
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: sheetName,
    });

    // Then, update with new values
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: sheetName,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values,
      },
    });
  }

  /**
   * Creates a completely new spreadsheet.
   */
  static async createSpreadsheet(integrationId: string, title: string) {
    const sheets = await this.getSheetsClient(integrationId);
    const response = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title,
        },
      },
    });
    return response.data;
  }
}
