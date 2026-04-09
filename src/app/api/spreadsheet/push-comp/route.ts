import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "~/utils/supabase/server";
import { getGoogleToken } from "~/utils/supabase/server";
import {
  writeCompToSheet,
  getColumnMap,
  writeCells,
  findCompRow,
  getCompSheetName,
  type CompType,
} from "~/lib/sheets-api";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json()) as {
      projectId: string;
      compId: string;
      compType: CompType;
      fields?: Record<string, unknown>;
    };

    const { projectId, compId, compType, fields } = body;

    if (!projectId || !compId || !compType) {
      return NextResponse.json(
        { error: "Missing required fields: projectId, compId, compType" },
        { status: 400 },
      );
    }

    if (!["Land", "Sales", "Rentals"].includes(compType)) {
      return NextResponse.json(
        { error: "Invalid compType. Must be Land, Sales, or Rentals" },
        { status: 400 },
      );
    }

    // Get Google token
    const tokenResult = await getGoogleToken();
    if (!tokenResult.token) {
      return NextResponse.json(
        {
          error:
            tokenResult.error ?? "No Google token available",
          code: tokenResult.code,
        },
        { status: 401 },
      );
    }

    // Get spreadsheet ID from projects table
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("spreadsheet_id")
      .eq("id", projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404 },
      );
    }

    const spreadsheetId = project.spreadsheet_id as string | null;
    if (!spreadsheetId) {
      return NextResponse.json(
        {
          error:
            "No spreadsheet linked to this project. Set spreadsheet_id in project settings.",
        },
        { status: 400 },
      );
    }

    const opts = { spreadsheetId, token: tokenResult.token };

    let result: { row: number; isNew: boolean };

    if (fields && Object.keys(fields).length > 0) {
      // Partial write: only write the provided fields
      // First get comp parsed data to identify the row
      const { data: parsedData } = await supabase
        .from("comp_parsed_data")
        .select("raw_data")
        .eq("comp_id", compId)
        .maybeSingle();

      const rawData = (parsedData?.raw_data ?? {}) as Record<string, unknown>;
      const useTypeVal = rawData["Use Type"] ?? fields["Use Type"] ?? "Sale";
      const recordingVal = rawData.Recording ?? fields.Recording ?? "";
      const useType =
        typeof useTypeVal === "string"
          ? useTypeVal
          : typeof useTypeVal === "number"
            ? String(useTypeVal)
            : "Sale";
      const recording =
        typeof recordingVal === "string"
          ? recordingVal
          : typeof recordingVal === "number"
            ? String(recordingVal)
            : "";

      if (!recording) {
        // No recording identifier — full write with just the provided fields
        result = await writeCompToSheet(opts, fields, compType);
      } else {
        // Find existing row and do partial update
        const sheetName = getCompSheetName(compType);
        const columnMap = await getColumnMap(opts, sheetName);
        const row = await findCompRow(opts, sheetName, useType, recording);

        if (row !== null) {
          await writeCells(opts, sheetName, row, columnMap, fields);
          result = { row, isNew: false };
        } else {
          result = await writeCompToSheet(opts, { ...rawData, ...fields }, compType);
        }
      }
    } else {
      // Full write: get all comp parsed data and write it
      const { data: parsedData } = await supabase
        .from("comp_parsed_data")
        .select("raw_data")
        .eq("comp_id", compId)
        .maybeSingle();

      if (!parsedData?.raw_data) {
        return NextResponse.json(
          { error: "No parsed data found for this comp" },
          { status: 404 },
        );
      }

      result = await writeCompToSheet(
        opts,
        parsedData.raw_data as Record<string, unknown>,
        compType,
      );
    }

    return NextResponse.json({
      success: true,
      row: result.row,
      isNew: result.isNew,
      message: result.isNew
        ? `Appended new comp to row ${result.row}`
        : `Updated comp at row ${result.row}`,
    });
  } catch (err) {
    console.error("[push-comp] Error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
