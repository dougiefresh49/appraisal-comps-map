import "server-only";
import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { createClient, createServiceClient } from "~/utils/supabase/server";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// CSV parser (handles quoted fields with embedded commas and newlines)
// ---------------------------------------------------------------------------

function splitCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

function countQuotes(s: string): number {
  let count = 0;
  for (const ch of s) {
    if (ch === '"') count++;
  }
  return count;
}

function parseCSVToObjects(raw: string): Record<string, string>[] {
  const lines = raw.split("\n");
  const headers = splitCSVLine(lines[0] ?? "").map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  let i = 1;
  while (i < lines.length) {
    // Handle multi-line quoted fields
    let combined = lines[i] ?? "";
    let currentLine = i + 1;
    while (countQuotes(combined) % 2 !== 0 && currentLine < lines.length) {
      combined += "\n" + (lines[currentLine] ?? "");
      currentLine++;
    }
    i = currentLine;

    const fields = splitCSVLine(combined);
    if (fields.length < 2) continue; // skip empty lines

    const obj: Record<string, string> = {};
    for (let h = 0; h < headers.length; h++) {
      obj[headers[h] ?? String(h)] = (fields[h] ?? "").trim();
    }
    rows.push(obj);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// CSV row accessor (avoids dot-notation lint errors for keys with spaces/symbols)
// ---------------------------------------------------------------------------

function get(row: Record<string, string>, key: string): string {
  return row[key] ?? "";
}

// ---------------------------------------------------------------------------
// Numeric helpers
// ---------------------------------------------------------------------------

function parseNumeric(val: string | undefined): number | null {
  if (!val) return null;
  const cleaned = val.replace(/[$,%\s]/g, "").replace(/,/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseInteger(val: string | undefined): number | null {
  if (!val) return null;
  const n = parseInt(val.trim(), 10);
  return isNaN(n) ? null : n;
}

function parseBoolean(val: string | undefined): boolean {
  if (!val) return false;
  return val.trim().toUpperCase() === "TRUE";
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function POST(request: Request) {
  try {
    const supabase =
      process.env.NODE_ENV === "development"
        ? createServiceClient()
        : await createClient();

    // Optional: accept an existing project_id instead of creating a new one
    let body: { project_id?: string; force?: boolean } = {};
    try {
      const text = await request.text();
      if (text.trim()) {
        body = JSON.parse(text) as typeof body;
      }
    } catch {
      // empty body is fine
    }

    const force = body.force === true;
    const csvDir = path.join(
      process.cwd(),
      "docs",
      "report-data-spreadsheet",
      "sheets-exported--csv",
    );

    if (!fs.existsSync(csvDir)) {
      return NextResponse.json(
        { error: "CSV directory not found: " + csvDir },
        { status: 404 },
      );
    }

    // ------------------------------------------------------------------
    // 1. Create or reuse the "Reference Library" project
    // ------------------------------------------------------------------
    let referenceProjectId: string;

    if (body.project_id) {
      referenceProjectId = body.project_id;
    } else {
      // Check if a reference library project already exists
      const { data: existing } = await supabase
        .from("projects")
        .select("id")
        .eq("name", "Reference Library")
        .eq("is_reference", true)
        .maybeSingle();

      if (existing && !force) {
        return NextResponse.json({
          message: "Reference Library project already exists. Pass force:true to re-import.",
          project_id: existing.id as string,
        });
      }

      if (existing && force) {
        referenceProjectId = existing.id as string;
        // Clean up existing comps for this project so we can re-import cleanly
        await supabase
          .from("comparables")
          .delete()
          .eq("project_id", referenceProjectId);
      } else {
        const { data: newProject, error: projectErr } = await supabase
          .from("projects")
          .insert({
            name: "Reference Library",
            is_reference: true,
          })
          .select("id")
          .single();

        if (projectErr ?? !newProject) {
          return NextResponse.json(
            { error: "Failed to create Reference Library project: " + projectErr?.message },
            { status: 500 },
          );
        }
        referenceProjectId = newProject.id as string;
      }
    }

    // ------------------------------------------------------------------
    // 2. Parse CSV files
    // ------------------------------------------------------------------
    const saleCompsPath = path.join(csvDir, "report-data  - sale comps.csv");
    const landCompsPath = path.join(csvDir, "report-data - land comps.csv");
    const parcelsPath = path.join(csvDir, "report-data - comp-parcels.csv");
    const improvementsPath = path.join(
      csvDir,
      "report-data - comp-parcel-improvements.csv",
    );

    for (const p of [saleCompsPath, landCompsPath, parcelsPath, improvementsPath]) {
      if (!fs.existsSync(p)) {
        return NextResponse.json(
          { error: "Required CSV file not found: " + p },
          { status: 404 },
        );
      }
    }

    const saleCompsRows = parseCSVToObjects(fs.readFileSync(saleCompsPath, "utf-8"));
    const landCompsRows = parseCSVToObjects(fs.readFileSync(landCompsPath, "utf-8"));
    const parcelsRows = parseCSVToObjects(fs.readFileSync(parcelsPath, "utf-8"));
    const improvementsRows = parseCSVToObjects(
      fs.readFileSync(improvementsPath, "utf-8"),
    );

    // ------------------------------------------------------------------
    // 3. Import sale comps and land comps
    // ------------------------------------------------------------------
    const stats = {
      saleComps: { inserted: 0, skipped: 0 },
      landComps: { inserted: 0, skipped: 0 },
      parcels: { inserted: 0, skipped: 0 },
      improvements: { inserted: 0, skipped: 0 },
    };

    // instrument_number -> comp_id map (built during import for parcel linking)
    const instrumentToCompId = new Map<string, string>();

    const importComps = async (
      rows: Record<string, string>[],
      compType: "Sales" | "Land",
      statsKey: "saleComps" | "landComps",
    ) => {
      // Rows may have negative #; assign positive sequence numbers
      let sequenceNum = 1;

      for (const row of rows) {
        const rawNum = get(row, "#");
        const address = get(row, "Address");
        const instrumentNumber = get(row, "Recording");

        if (!address && !instrumentNumber) {
          stats[statsKey].skipped++;
          continue;
        }

        const compId = randomUUID();
        const assignedNumber = String(sequenceNum++);

        // Insert into comparables
        const { error: compErr } = await supabase.from("comparables").insert({
          id: compId,
          project_id: referenceProjectId,
          type: compType,
          number: assignedNumber,
          address: address,
          address_for_display: address,
          instrument_number: instrumentNumber || null,
        });

        if (compErr) {
          console.error(`Failed to insert comparable (${address}):`, compErr);
          stats[statsKey].skipped++;
          continue;
        }

        // Track instrument_number -> comp_id mapping for parcel linking
        if (instrumentNumber) {
          instrumentToCompId.set(instrumentNumber, compId);
        }

        // Insert into comp_parsed_data with entire CSV row as raw_data
        const { error: dataErr } = await supabase.from("comp_parsed_data").insert({
          comp_id: compId,
          project_id: referenceProjectId,
          raw_data: { ...row, _csvNumber: rawNum, _importedType: compType },
        });

        if (dataErr) {
          console.error(
            `Failed to insert comp_parsed_data for ${address}:`,
            dataErr,
          );
        }

        stats[statsKey].inserted++;
      }
    };

    await importComps(saleCompsRows, "Sales", "saleComps");
    await importComps(landCompsRows, "Land", "landComps");

    // ------------------------------------------------------------------
    // 4. Import comp parcels
    // ------------------------------------------------------------------
    // instrument_number + apn -> parcel_id map for improvements linking
    const parcelKey = (instrNum: string, apn: string) =>
      `${instrNum.trim()}|${apn.trim()}`;
    const parcelKeyToId = new Map<string, string>();

    for (const row of parcelsRows) {
      const instrumentNumber = get(row, "instrumentNumber");
      const apn = get(row, "APN");

      if (!instrumentNumber || !apn) {
        stats.parcels.skipped++;
        continue;
      }

      const compId = instrumentToCompId.get(instrumentNumber);

      const { data: parcelRow, error: parcelErr } = await supabase
        .from("comp_parcels")
        .insert({
          comp_id: compId ?? null,
          project_id: referenceProjectId,
          instrument_number: instrumentNumber,
          apn: apn,
          apn_link: get(row, "APN Link"),
          location: get(row, "Location"),
          legal: get(row, "Legal"),
          lot_number: get(row, "Lot #") || null,
          size_ac: parseNumeric(get(row, "Size (AC)")),
          size_sf: parseNumeric(get(row, "Size (SF)")),
          building_size_sf: parseNumeric(get(row, "Building Size (SF)")),
          office_area_sf: parseNumeric(get(row, "Office Area (SF)")),
          warehouse_area_sf: parseNumeric(get(row, "Warehouse Area (SF)")),
          storage_area_sf: parseNumeric(get(row, "Storage Area (SF)")),
          buildings: parseInteger(get(row, "Buildings")),
          parking_sf: parseNumeric(get(row, "Parking (SF)")),
          total_tax_amount: parseNumeric(get(row, "Total Tax Amount")),
          county_appraised_value: parseNumeric(get(row, "County Appraised Value")),
        })
        .select("id")
        .single();

      if (parcelErr ?? !parcelRow) {
        console.error(
          `Failed to insert comp_parcel (${instrumentNumber}/${apn}):`,
          parcelErr,
        );
        stats.parcels.skipped++;
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parcelId: string = parcelRow.id;
      parcelKeyToId.set(parcelKey(instrumentNumber, apn), parcelId);
      stats.parcels.inserted++;
    }

    // ------------------------------------------------------------------
    // 5. Import comp parcel improvements
    // ------------------------------------------------------------------
    for (const row of improvementsRows) {
      const instrumentNumber = get(row, "instrumentNumber");
      const apn = get(row, "APN");

      if (!instrumentNumber || !apn) {
        stats.improvements.skipped++;
        continue;
      }

      const parcelId = parcelKeyToId.get(parcelKey(instrumentNumber, apn));
      const compId = instrumentToCompId.get(instrumentNumber);

      const { error: impErr } = await supabase
        .from("comp_parcel_improvements")
        .insert({
          parcel_id: parcelId ?? null,
          comp_id: compId ?? null,
          project_id: referenceProjectId,
          instrument_number: instrumentNumber,
          apn: apn,
          building_number: parseInteger(get(row, "Building #")) ?? 1,
          section_number: parseInteger(get(row, "Section #")) ?? 1,
          year_built: parseInteger(get(row, "Year Built")),
          effective_year_built: parseInteger(get(row, "Effective Year Built")),
          gross_building_area_sf: parseNumeric(get(row, "Gross Building Area (SF)")),
          office_area_sf: parseNumeric(get(row, "Office Area (SF)")),
          warehouse_area_sf: parseNumeric(get(row, "Warehouse Area (SF)")),
          storage_area_sf: parseNumeric(get(row, "Storage Area (SF)")),
          parking_sf: parseNumeric(get(row, "Parking (SF)")),
          is_gla: parseBoolean(get(row, "Is GLA")),
          construction: get(row, "Construction"),
          comments: get(row, "Comments") || null,
        });

      if (impErr) {
        console.error(
          `Failed to insert comp_parcel_improvement (${instrumentNumber}/${apn}):`,
          impErr,
        );
        stats.improvements.skipped++;
        continue;
      }

      stats.improvements.inserted++;
    }

    return NextResponse.json({
      message: "CSV import complete",
      project_id: referenceProjectId,
      stats,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to import CSV comps",
      },
      { status: 500 },
    );
  }
}
