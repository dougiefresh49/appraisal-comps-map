import "server-only";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SheetsWriteOptions {
  spreadsheetId: string;
  token: string;
}

export type CompType = "Land" | "Sales" | "Rentals";

// ---------------------------------------------------------------------------
// Constants: sheet tab names
// ---------------------------------------------------------------------------

const SHEET_NAMES: Record<CompType, string> = {
  Land: "land comps",
  Sales: "sale comps",
  Rentals: "rental comps",
};

const SUMMARY_SHEET_NAMES: Record<CompType, string> = {
  Land: "land-summary-chart",
  Sales: "sales-summary-chart",
  Rentals: "rent-summary-chart",
};

const SUBJECT_SHEET_NAME = "subject";
const UI_TEMPLATES_SHEET_NAME = "ui-templates";

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

/** Convert a 0-based column index to an A1 column letter (0 → A, 25 → Z, 26 → AA). */
function colToLetter(col: number): string {
  let letter = "";
  let n = col + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

/** Safely coerce an unknown value to a string (never returns [object Object]). */
function toSafeString(val: unknown, fallback = ""): string {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return fallback;
}

/** Build a Sheets REST API v4 URL for the values endpoint. */
function valuesUrl(
  spreadsheetId: string,
  range: string,
  params?: Record<string, string>,
): string {
  const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`;
  if (!params || Object.keys(params).length === 0) return base;
  const qs = new URLSearchParams(params).toString();
  return `${base}?${qs}`;
}

/** Perform a GET to the Sheets API. */
async function sheetsGet<T>(
  token: string,
  spreadsheetId: string,
  range: string,
): Promise<T> {
  const url = valuesUrl(spreadsheetId, range);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Sheets GET failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }
  return res.json() as Promise<T>;
}

/** Perform a PUT to the Sheets API (values.update). */
async function sheetsPut(
  token: string,
  spreadsheetId: string,
  range: string,
  values: unknown[][],
  valueInputOption: "RAW" | "USER_ENTERED" = "RAW",
): Promise<void> {
  const url = valuesUrl(spreadsheetId, range, { valueInputOption });
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ range, values }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Sheets PUT failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }
}

/** Perform a POST batchUpdate to the Sheets API (values.batchUpdate). */
async function sheetsBatchUpdate(
  token: string,
  spreadsheetId: string,
  data: Array<{ range: string; values: unknown[][] }>,
  valueInputOption: "RAW" | "USER_ENTERED" = "RAW",
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ valueInputOption, data }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Sheets batchUpdate failed (${res.status}): ${body.slice(0, 300)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Reads header row 1 of the given sheet and returns a Map of field name → 0-based column index.
 */
export async function getColumnMap(
  opts: SheetsWriteOptions,
  sheetName: string,
): Promise<Map<string, number>> {
  const range = `'${sheetName}'!1:1`;
  const result = await sheetsGet<{ values?: string[][] }>(
    opts.token,
    opts.spreadsheetId,
    range,
  );
  const headers: string[] = result.values?.[0] ?? [];
  const map = new Map<string, number>();
  headers.forEach((h, i) => {
    if (h) map.set(h, i);
  });
  return map;
}

/**
 * Finds the row number (1-based) of the comp matching useType + recording.
 * Returns null if no match is found.
 */
export async function findCompRow(
  opts: SheetsWriteOptions,
  sheetName: string,
  useType: string,
  recording: string,
): Promise<number | null> {
  const columnMap = await getColumnMap(opts, sheetName);
  const useTypeCol = columnMap.get("Use Type");
  const recordingCol = columnMap.get("Recording");

  if (useTypeCol === undefined || recordingCol === undefined) {
    throw new Error(
      `Sheet "${sheetName}" is missing required columns: Use Type or Recording`,
    );
  }

  const maxCol = Math.max(useTypeCol, recordingCol);
  const range = `'${sheetName}'!A2:${colToLetter(maxCol)}`;
  const result = await sheetsGet<{ values?: string[][] }>(
    opts.token,
    opts.spreadsheetId,
    range,
  );
  const rows: string[][] = result.values ?? [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowUseType = row[useTypeCol] ?? "";
    const rowRecording = row[recordingCol] ?? "";
    if (
      rowUseType.trim().toLowerCase() === useType.trim().toLowerCase() &&
      rowRecording.trim().toLowerCase() === recording.trim().toLowerCase()
    ) {
      return i + 2; // +2 because data starts at row 2 (row 1 is headers)
    }
  }
  return null;
}

/**
 * Writes specific cells in a row using RAW ValueInputOption.
 * fields is a map of column header name → value to write.
 */
export async function writeCells(
  opts: SheetsWriteOptions,
  sheetName: string,
  row: number,
  columnMap: Map<string, number>,
  fields: Record<string, unknown>,
): Promise<void> {
  const batchData: Array<{ range: string; values: unknown[][] }> = [];

  for (const [fieldName, value] of Object.entries(fields)) {
    const col = columnMap.get(fieldName);
    if (col === undefined) continue;
    const cellRange = `'${sheetName}'!${colToLetter(col)}${row}`;
    const cellValue =
      value === null || value === undefined
        ? ""
        : typeof value === "boolean"
          ? value
            ? "Yes"
            : "No"
          : value;
    batchData.push({ range: cellRange, values: [[cellValue]] });
  }

  if (batchData.length === 0) return;

  await sheetsBatchUpdate(opts.token, opts.spreadsheetId, batchData, "RAW");
}

/**
 * Appends a new row with formulas copied from the last data row,
 * then writes data fields over the new row.
 * This mimics the Apps Script autoFill pattern.
 */
export async function appendRowWithFormulas(
  opts: SheetsWriteOptions,
  sheetName: string,
  fields: Record<string, unknown>,
): Promise<number> {
  const columnMap = await getColumnMap(opts, sheetName);

  // Find the last populated row by reading all data
  const range = `'${sheetName}'!A:A`;
  const result = await sheetsGet<{ values?: string[][] }>(
    opts.token,
    opts.spreadsheetId,
    range,
  );
  const colAValues: string[][] = result.values ?? [];
  // Last row = length of values (including header row 1)
  const lastRow = colAValues.length;
  const newRow = lastRow + 1;

  if (lastRow > 1) {
    // Read the last data row to find formula cells
    const lastRowRange = `'${sheetName}'!${lastRow}:${lastRow}`;
    // Re-fetch with FORMULA render option to detect formula cells
    const formulaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(opts.spreadsheetId)}/values/${encodeURIComponent(lastRowRange)}?valueRenderOption=FORMULA`;
    const formulaRes = await fetch(formulaUrl, {
      headers: { Authorization: `Bearer ${opts.token}` },
    });
    if (formulaRes.ok) {
      const formulaData = (await formulaRes.json()) as { values?: string[][] };
      const lastRowValues: string[] = formulaData.values?.[0] ?? [];
      const formulaCells: Array<{ range: string; values: unknown[][] }> = [];

      for (let col = 0; col < lastRowValues.length; col++) {
        const cellValue = lastRowValues[col] ?? "";
        if (cellValue.startsWith("=")) {
          const cellRange = `'${sheetName}'!${colToLetter(col)}${newRow}`;
          formulaCells.push({ range: cellRange, values: [[cellValue]] });
        }
      }

      if (formulaCells.length > 0) {
        await sheetsBatchUpdate(
          opts.token,
          opts.spreadsheetId,
          formulaCells,
          "USER_ENTERED",
        );
      }
    }
  }

  // Write data fields over the new row
  await writeCells(opts, sheetName, newRow, columnMap, fields);

  return newRow;
}

/**
 * Finds all rows with Use Type = "Sale" (or "Rental") and writes "Old Report" to their Use Type cell.
 * Returns the count of updated rows.
 */
export async function markCompsAsOldReport(
  opts: SheetsWriteOptions,
  sheetName: string,
): Promise<number> {
  const columnMap = await getColumnMap(opts, sheetName);
  const useTypeCol = columnMap.get("Use Type");
  if (useTypeCol === undefined) {
    throw new Error(`Sheet "${sheetName}" is missing "Use Type" column`);
  }

  const range = `'${sheetName}'!${colToLetter(useTypeCol)}2:${colToLetter(useTypeCol)}`;
  const result = await sheetsGet<{ values?: string[][] }>(
    opts.token,
    opts.spreadsheetId,
    range,
  );
  const values: string[][] = result.values ?? [];

  const activeTypes = new Set(["Sale", "Rental"]);
  const updates: Array<{ range: string; values: unknown[][] }> = [];

  for (let i = 0; i < values.length; i++) {
    const cellValue = values[i]?.[0] ?? "";
    if (activeTypes.has(cellValue.trim())) {
      const row = i + 2;
      updates.push({
        range: `'${sheetName}'!${colToLetter(useTypeCol)}${row}`,
        values: [["Old Report"]],
      });
    }
  }

  if (updates.length > 0) {
    await sheetsBatchUpdate(opts.token, opts.spreadsheetId, updates, "RAW");
  }

  return updates.length;
}

// ---------------------------------------------------------------------------
// High-level push functions
// ---------------------------------------------------------------------------

/**
 * Writes a comp's fields to the appropriate sheet tab.
 * If the comp (identified by Use Type + Recording) already exists in the sheet,
 * updates its row. Otherwise appends a new row with formulas.
 */
export async function writeCompToSheet(
  opts: SheetsWriteOptions,
  comp: Record<string, unknown>,
  type: CompType,
): Promise<{ row: number; isNew: boolean }> {
  const sheetName = SHEET_NAMES[type];
  const columnMap = await getColumnMap(opts, sheetName);

  const useType = toSafeString(comp["Use Type"], "Sale");
  const recording = toSafeString(comp.Recording, "");

  let row: number | null = null;
  let isNew = false;

  if (recording) {
    row = await findCompRow(opts, sheetName, useType, recording);
  }

  if (row === null) {
    // Comp not found — append a new row
    row = await appendRowWithFormulas(opts, sheetName, comp);
    isNew = true;
  } else {
    // Comp found — update existing row
    await writeCells(opts, sheetName, row, columnMap, comp);
  }

  return { row, isNew };
}

/**
 * Writes subject data fields to row 2 of the subject sheet.
 */
export async function writeSubjectToSheet(
  opts: SheetsWriteOptions,
  subjectData: Record<string, unknown>,
): Promise<void> {
  const columnMap = await getColumnMap(opts, SUBJECT_SHEET_NAME);
  await writeCells(opts, SUBJECT_SHEET_NAME, 2, columnMap, subjectData);
}

/**
 * Writes label strings to column A of the summary chart sheet (A2:A{n}).
 */
export async function writeSummaryLabels(
  opts: SheetsWriteOptions,
  labels: string[],
  type: CompType,
): Promise<void> {
  const sheetName = SUMMARY_SHEET_NAMES[type];
  if (!labels.length) return;

  const range = `'${sheetName}'!A2:A${labels.length + 1}`;
  await sheetsPut(
    opts.token,
    opts.spreadsheetId,
    range,
    labels.map((l) => [l]),
    "RAW",
  );
}

/**
 * Writes template config sections to the ui-templates sheet.
 * Each section is written as a row with title, side, and serialized rows.
 */
export async function writeTemplateConfig(
  opts: SheetsWriteOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template: any[],
  type: CompType,
): Promise<void> {
  const sheetName = UI_TEMPLATES_SHEET_NAME;
  const columnMap = await getColumnMap(opts, sheetName);

  // Write type identifier + JSON blob in a single row
  // Column A = comp type, Column B = template JSON
  const typeCol = columnMap.get("Comp Type");
  const dataCol = columnMap.get("Template Data");

  if (typeCol === undefined || dataCol === undefined) {
    // Fall back to writing to columns A and B
    const range = `'${sheetName}'!A2:B2`;
    await sheetsPut(
      opts.token,
      opts.spreadsheetId,
      range,
      [[type, JSON.stringify(template)]],
      "RAW",
    );
    return;
  }

  await writeCells(opts, sheetName, 2, columnMap, {
    [columnMap.get("Comp Type") !== undefined ? "Comp Type" : "A"]: type,
    [columnMap.get("Template Data") !== undefined
      ? "Template Data"
      : "B"]: JSON.stringify(template),
  });
}

// ---------------------------------------------------------------------------
// Exported sheet name helpers (for API routes)
// ---------------------------------------------------------------------------

export function getCompSheetName(type: CompType): string {
  return SHEET_NAMES[type];
}

export function getSummarySheetName(type: CompType): string {
  return SUMMARY_SHEET_NAMES[type];
}

export { SUBJECT_SHEET_NAME, UI_TEMPLATES_SHEET_NAME };
