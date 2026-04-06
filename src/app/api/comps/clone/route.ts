import "server-only";
import { NextResponse } from "next/server";
import { createClient, getGoogleToken } from "~/utils/supabase/server";
import {
  listFolderChildren,
  findOrCreateFolder,
  copyFile,
} from "~/lib/drive-api";

interface CloneRequestBody {
  sourceCompId: string;
  projectId: string;
  compType: "Land" | "Sales" | "Rentals";
  /** Destination comps folder in the current project (e.g. folder_structure.compsFolderIds.land) */
  compsFolderId?: string;
}

export interface CloneComparableResponse {
  compId: string;
  address: string;
  addressForDisplay: string;
  apn?: string[];
  instrumentNumber?: string;
  folderId?: string;
}

export async function POST(request: Request) {
  try {
    let body: CloneRequestBody;
    try {
      body = (await request.json()) as CloneRequestBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { sourceCompId, projectId, compType, compsFolderId } = body;

    if (!sourceCompId || !projectId || !compType) {
      return NextResponse.json(
        { error: "sourceCompId, projectId, and compType are required" },
        { status: 400 },
      );
    }

    const supabase = await createClient();

    // ── 1. Fetch source comparable ──────────────────────────────────────────
    const { data: sourceComp, error: sourceError } = await supabase
      .from("comparables")
      .select("id, address, address_for_display, apn, instrument_number, folder_id")
      .eq("id", sourceCompId)
      .single();

    if (sourceError ?? !sourceComp) {
      return NextResponse.json({ error: "Source comp not found" }, { status: 404 });
    }

    const address = (sourceComp.address as string) ?? "";
    const addressForDisplay =
      (sourceComp.address_for_display as string | null) ?? address;
    const apn = sourceComp.apn as string[] | null;
    const instrumentNumber = sourceComp.instrument_number as string | null;
    const sourceFolderId = sourceComp.folder_id as string | null;

    // ── 2. Fetch source parsed data ─────────────────────────────────────────
    const { data: sourceParsed } = await supabase
      .from("comp_parsed_data")
      .select("raw_data")
      .eq("comp_id", sourceCompId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // ── 3. Copy Drive folder (best-effort) ──────────────────────────────────
    let newFolderId: string | undefined;
    if (sourceFolderId && compsFolderId) {
      try {
        const { token } = await getGoogleToken();
        if (token) {
          const files = await listFolderChildren(token, sourceFolderId, {
            filesOnly: true,
          });
          const folderName = address || `Comp-${sourceCompId.slice(0, 8)}`;
          const newFolder = await findOrCreateFolder(token, compsFolderId, folderName);
          newFolderId = newFolder.id;
          await Promise.all(
            files.map((f) => copyFile(token, f.id, newFolder.id, f.name)),
          );
        }
      } catch (driveErr) {
        // Drive copy is best-effort — log but don't fail the clone
        console.error("[comps/clone] Drive copy failed (non-fatal):", driveErr);
      }
    }

    // ── 4. Insert new comparable ────────────────────────────────────────────
    const newCompId = crypto.randomUUID();

    const { error: insertError } = await supabase.from("comparables").insert({
      id: newCompId,
      project_id: projectId,
      type: compType,
      address,
      address_for_display: addressForDisplay,
      apn: apn ?? [],
      instrument_number: instrumentNumber ?? null,
      folder_id: newFolderId ?? null,
      images: [],
      parsed_data_status: sourceParsed ? "parsed" : "none",
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // ── 5. Copy parsed data ─────────────────────────────────────────────────
    if (sourceParsed) {
      const rawData = (sourceParsed.raw_data ?? {}) as Record<string, unknown>;
      const { error: parsedInsertError } = await supabase
        .from("comp_parsed_data")
        .insert({
          comp_id: newCompId,
          project_id: projectId,
          raw_data: rawData,
          source: "cloned",
        });

      if (parsedInsertError) {
        // Roll back the comparable if parsed data fails
        await supabase.from("comparables").delete().eq("id", newCompId);
        return NextResponse.json(
          { error: parsedInsertError.message },
          { status: 500 },
        );
      }
    }

    const result: CloneComparableResponse = {
      compId: newCompId,
      address,
      addressForDisplay,
      apn: apn && apn.length > 0 ? apn : undefined,
      instrumentNumber: instrumentNumber ?? undefined,
      folderId: newFolderId,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("[comps/clone] unexpected error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Clone failed" },
      { status: 500 },
    );
  }
}
