import "server-only";

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { listFolderChildren } from "~/lib/drive-api";
import {
  type CompCandidate,
  matchComps,
  normalizeAddress,
  type RefLibComp,
} from "~/lib/comp-matcher";
import { mapExtractedToRawData } from "~/lib/comp-field-mapper";
import type { FolderStructure } from "~/lib/project-discovery";
import {
  discoverFolderStructure,
  findSpreadsheetCandidates,
} from "~/lib/project-discovery";
import type {
  ExtractedLandComp,
  ExtractedRentalComp,
  ExtractedSaleComp,
} from "~/lib/report-md-parser";
import { createClient, createServiceClient, getGoogleToken } from "~/utils/supabase/server";

const TAG = "[backfill-comps]";

interface BackfillCompsBody {
  phase?: "A" | "B" | "C" | "D" | "E" | "all";
  force?: boolean;
  project_id?: string;
}

function uuidFromHash(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function isNonEmptyFolderStructure(fs: unknown): boolean {
  if (fs == null || typeof fs !== "object" || Array.isArray(fs)) {
    return false;
  }
  const o = fs as Record<string, unknown>;
  for (const v of Object.values(o)) {
    if (v == null) continue;
    if (typeof v === "string" && v.trim() !== "") return true;
    if (typeof v === "object" && !Array.isArray(v)) {
      for (const vv of Object.values(v as Record<string, unknown>)) {
        if (typeof vv === "string" && vv.trim() !== "") return true;
      }
    }
  }
  return false;
}

function effectiveTimestampFromCore(
  core: Record<string, unknown> | null | undefined,
  projectCreatedAt: string | null | undefined,
): number {
  if (core && typeof core === "object") {
    const ed = core.effectiveDate ?? core["Effective Date"];
    if (typeof ed === "string" && ed.trim() !== "") {
      const t = Date.parse(ed);
      if (!Number.isNaN(t)) return t;
    }
  }
  if (projectCreatedAt) {
    const t = Date.parse(projectCreatedAt);
    if (!Number.isNaN(t)) return t;
  }
  return 0;
}

function asExtractedLand(arr: unknown): ExtractedLandComp[] {
  return Array.isArray(arr) ? (arr as ExtractedLandComp[]) : [];
}

function asExtractedSale(arr: unknown): ExtractedSaleComp[] {
  return Array.isArray(arr) ? (arr as ExtractedSaleComp[]) : [];
}

function asExtractedRental(arr: unknown): ExtractedRentalComp[] {
  return Array.isArray(arr) ? (arr as ExtractedRentalComp[]) : [];
}

function compsFolderKey(t: CompCandidate["type"]): keyof NonNullable<FolderStructure["compsFolderIds"]> {
  if (t === "Land") return "land";
  if (t === "Sales") return "sales";
  return "rentals";
}

function extractStreetCore(normalized: string): string {
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length <= 1) return normalized;
  const stopWords = new Set(["odessa", "midland", "kermit", "mccamey", "monahans", "pecos", "crane", "andrews"]);
  return tokens.filter((t) => !stopWords.has(t)).join(" ");
}

function fuzzyAddressMatch(folderName: string, address: string): boolean {
  const nf = normalizeAddress(folderName);
  const na = normalizeAddress(address);
  if (nf === na) return true;
  if (nf === "" || na === "") return false;
  const cf = extractStreetCore(nf);
  const ca = extractStreetCore(na);
  if (cf === ca) return true;
  if (cf.includes(ca) || ca.includes(cf)) return true;
  const fTokens = cf.split(" ");
  const aTokens = ca.split(" ");
  if (fTokens.length >= 2 && aTokens.length >= 2) {
    if (fTokens[0] === aTokens[0] && fTokens[1] === aTokens[1]) return true;
  }
  return false;
}

type DriveChildCache = Map<string, { id: string; name: string }[]>;

async function getCompTypeFolderChildren(
  token: string,
  parentId: string,
  cache: DriveChildCache,
): Promise<{ id: string; name: string }[]> {
  const cached = cache.get(parentId);
  if (cached) return cached;
  const children = await listFolderChildren(token, parentId, { foldersOnly: true });
  const mapped = children.map((f) => ({ id: f.id, name: f.name }));
  cache.set(parentId, mapped);
  return mapped;
}

async function findCompFolderId(
  token: string | null,
  folderStructure: unknown,
  compType: CompCandidate["type"],
  address: string,
  folderCache: DriveChildCache,
): Promise<string | null> {
  if (!token) return null;
  const fs = folderStructure as FolderStructure | null | undefined;
  const parentId = fs?.compsFolderIds?.[compsFolderKey(compType)];
  if (!parentId) return null;
  try {
    const children = await getCompTypeFolderChildren(token, parentId, folderCache);
    const hit = children.find((f) => fuzzyAddressMatch(f.name, address));
    return hit?.id ?? null;
  } catch (e) {
    console.warn(`${TAG} folder lookup failed for ${address}:`, e);
    return null;
  }
}

const IMAGE_MIME_PREFIXES = ["image/"];

async function listCompImages(
  token: string,
  folderId: string,
): Promise<{ id: string; name: string; mimeType: string }[]> {
  try {
    const files = await listFolderChildren(token, folderId, { filesOnly: true });
    return files
      .filter((f) => IMAGE_MIME_PREFIXES.some((p) => f.mimeType.startsWith(p)))
      .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType }));
  } catch {
    return [];
  }
}

function extractApnFromRawData(rawData: Record<string, unknown>): unknown[] {
  const val = rawData.APN ?? rawData.apn;
  if (val == null) return [];
  if (typeof val === "string" && val.trim() !== "") {
    return [val.trim()];
  }
  if (Array.isArray(val)) return val;
  return [];
}

/** Row shape for Phase E comparables select — typed so eslint does not treat fields as `any`. */
interface PhaseECompRow {
  id: string;
  project_id: string;
  address: string;
  type: string;
  apn: string[] | null;
  folder_id: string | null;
  images: Array<{
    id: string;
    name: string;
    mimeType: string;
    webViewLink?: string;
    webViewUrl?: string;
  }> | null;
}

type SupabaseLike = ReturnType<typeof createServiceClient>;

interface RefProjectRow {
  id: string;
  name: string;
  created_at: string | null;
  folder_structure: unknown;
  spreadsheet_id: string | null;
  project_folder_id: string | null;
}

interface PhaseAProjectRow {
  id: string;
  name: string;
  folder_structure: unknown;
  spreadsheet_id: string | null;
  project_folder_id: string | null;
}

interface CompIdRow {
  comp_id?: string | null;
}

export async function POST(request: Request) {
  const started = Date.now();
  const supabase: SupabaseLike =
    process.env.NODE_ENV === "development"
      ? createServiceClient()
      : await createClient();

  let body: BackfillCompsBody = { phase: "all", force: false };
  try {
    const text = await request.text();
    if (text.trim()) {
      body = { ...body, ...(JSON.parse(text) as BackfillCompsBody) };
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const phase = body.phase ?? "all";
  const force = body.force === true;
  const singleProjectId =
    typeof body.project_id === "string" && body.project_id.trim() !== ""
      ? body.project_id.trim()
      : null;

  const runA = phase === "all" || phase === "A";
  const runB = phase === "all" || phase === "B";
  const runC = phase === "all" || phase === "C";
  const runD = phase === "all" || phase === "D";
  const runE = phase === "all" || phase === "E";
  const folderCache: DriveChildCache = new Map();

  const phaseA = { discovered: 0, skipped: 0, errors: [] as string[] };
  const phaseB = {
    compsAssigned: 0,
    parcelsCreated: 0,
    improvementsCreated: 0,
    errors: [] as string[],
  };
  const phaseC = { compsCreated: 0, errors: [] as string[] };
  let phaseD = { historicalMarked: 0 };

  const google = await getGoogleToken();
  const driveToken = google.token;

  if (runA) {
    try {
      let q = supabase
        .from("projects")
        .select(
          "id, name, folder_structure, spreadsheet_id, project_folder_id, is_reference",
        )
        .eq("is_reference", true)
        .not("project_folder_id", "is", null);

      if (singleProjectId) {
        q = q.eq("id", singleProjectId);
      }

      const { data: refProjects, error: projErr } = await q;

      if (projErr) {
        phaseA.errors.push(`Phase A query failed: ${projErr.message}`);
        console.error(`${TAG} Phase A query error`, projErr);
      } else {
        let loggedNoDrive = false;
        for (const row of (refProjects ?? []) as PhaseAProjectRow[]) {
          if (!driveToken) {
            if (!loggedNoDrive) {
              phaseA.errors.push(
                "Phase A skipped: no Google Drive token (sign in for folder discovery).",
              );
              console.warn(`${TAG} Phase A: no Drive token; skipping folder discovery`);
              loggedNoDrive = true;
            }
            break;
          }
          const fsExisting = row.folder_structure;
          if (isNonEmptyFolderStructure(fsExisting) && !force) {
            phaseA.skipped++;
            continue;
          }
          const folderId = row.project_folder_id;
          if (!folderId) {
            phaseA.skipped++;
            continue;
          }
          try {
            const folderStructure = await discoverFolderStructure(driveToken, folderId);
            const spreadsheetCandidates = await findSpreadsheetCandidates(
              driveToken,
              folderStructure.reportsFolderId,
              folderId,
            );
            const spreadsheetId =
              spreadsheetCandidates.length === 1 ? spreadsheetCandidates[0]!.id : null;

            const { error: upErr } = await supabase
              .from("projects")
              .update({
                folder_structure: folderStructure,
                spreadsheet_id: spreadsheetId,
              })
              .eq("id", row.id);

            if (upErr) {
              phaseA.errors.push(`Phase A: ${row.name}: ${upErr.message}`);
            } else {
              phaseA.discovered++;
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            const rowName =
              row && typeof row === "object" && "name" in row
                ? String((row as { name: unknown }).name)
                : "(unknown)";
            phaseA.errors.push(`Phase A: ${rowName}: ${msg}`);
            console.error(`${TAG} Phase A discovery failed`, row, e);
          }
        }
      }
      console.log(`${TAG} Phase A: Discovered folders for ${phaseA.discovered} projects`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      phaseA.errors.push(`Phase A fatal: ${msg}`);
      console.error(`${TAG} Phase A fatal`, e);
    }
  }

  let refLibId: string | null = null;
  const refLibCompsRows: {
    id: string;
    address: string;
    type: string;
    address_for_display: string | null;
    apn: unknown;
    instrument_number: string | null;
    folder_id: string | null;
    images: unknown;
  }[] = [];

  const parsedByCompId = new Map<string, Record<string, unknown>>();
  const parcelsByCompId = new Map<string, Record<string, unknown>[]>();
  const improvementsByCompId = new Map<string, Record<string, unknown>[]>();

  if (runB || runC || runD) {
    const { data: refLibRow } = await supabase
      .from("projects")
      .select("id")
      .eq("name", "Reference Library")
      .eq("is_reference", true)
      .maybeSingle();

    refLibId = (refLibRow?.id as string | undefined) ?? null;

    if ((runB || runC) && refLibId) {
      const { data: comps, error: cErr } = await supabase
        .from("comparables")
        .select(
          "id, address, type, address_for_display, apn, instrument_number, folder_id, images",
        )
        .eq("project_id", refLibId);

      if (cErr) {
        phaseB.errors.push(`Reference Library comparables load failed: ${cErr.message}`);
        console.error(`${TAG}`, cErr);
      } else {
        refLibCompsRows.push(...(comps ?? []));
      }

      const compIds = refLibCompsRows.map((c) => c.id);

      if (compIds.length > 0) {
        const { data: parsedRows, error: pErr } = await supabase
          .from("comp_parsed_data")
          .select("comp_id, raw_data")
          .in("comp_id", compIds);

        if (pErr) {
          phaseB.errors.push(`comp_parsed_data load failed: ${pErr.message}`);
        } else {
          for (const pr of parsedRows ?? []) {
            if (pr.comp_id) {
              parsedByCompId.set(
                pr.comp_id as string,
                (pr.raw_data as Record<string, unknown>) ?? {},
              );
            }
          }
        }

        const { data: parcels, error: parErr } = await supabase
          .from("comp_parcels")
          .select("*")
          .in("comp_id", compIds);

        if (parErr) {
          phaseB.errors.push(`comp_parcels load failed: ${parErr.message}`);
        } else {
          for (const p of parcels ?? []) {
            const cid = (p as CompIdRow).comp_id ?? null;
            if (!cid) continue;
            const list = parcelsByCompId.get(cid) ?? [];
            list.push(p as Record<string, unknown>);
            parcelsByCompId.set(cid, list);
          }
        }

        const { data: imps, error: iErr } = await supabase
          .from("comp_parcel_improvements")
          .select("*")
          .in("comp_id", compIds);

        if (iErr) {
          phaseB.errors.push(`comp_parcel_improvements load failed: ${iErr.message}`);
        } else {
          for (const imp of imps ?? []) {
            const cid = (imp as CompIdRow).comp_id ?? null;
            if (!cid) continue;
            const list = improvementsByCompId.get(cid) ?? [];
            list.push(imp as Record<string, unknown>);
            improvementsByCompId.set(cid, list);
          }
        }
      }
    } else if (runB || runC) {
      console.warn(`${TAG} Phase B/C: Reference Library project not found — skipping library matching`);
      phaseB.errors.push("Reference Library project not found (skipped Phase B library copy).");
    }
  }

  const refLibraryCompsForMatch: RefLibComp[] = refLibCompsRows.map((c) => {
    const raw = parsedByCompId.get(c.id) ?? {};
    const rec = raw.Recording;
    const inst =
      c.instrument_number ??
      (typeof rec === "string" && rec.trim() !== "" ? rec.trim() : null);
    return {
      id: c.id,
      address: c.address,
      instrumentNumber: inst,
      apn: c.apn,
      type: c.type,
      rawData: raw,
    };
  });

  let unmatchedCandidates: CompCandidate[] = [];

  if (runB || runC) {
    try {
      let pq = supabase
        .from("projects")
        .select("id, name, created_at, folder_structure")
        .eq("is_reference", true);

      if (singleProjectId) {
        pq = pq.eq("id", singleProjectId);
      }

      const { data: allRefProjects, error: pErr2 } = await pq;

      if (pErr2) {
        phaseB.errors.push(`Reference projects list failed: ${pErr2.message}`);
      } else {
        const projectIds = (allRefProjects ?? []).map((p) => p.id as string);
        const { data: subjects } = await supabase
          .from("subject_data")
          .select("project_id, core")
          .in("project_id", projectIds);

        const coreByProject = new Map<string, Record<string, unknown>>();
        for (const s of subjects ?? []) {
          const pid = s.project_id as string;
          const core = s.core as Record<string, unknown> | null;
          if (core && typeof core === "object") {
            coreByProject.set(pid, core);
          }
        }

        const sortedProjects: RefProjectRow[] = [...(allRefProjects ?? [])].sort(
          (a, b) => {
            const ca = coreByProject.get(String(a.id)) ?? null;
            const cb = coreByProject.get(String(b.id)) ?? null;
            const ta = effectiveTimestampFromCore(
              ca,
              a.created_at != null ? String(a.created_at) : null,
            );
            const tb = effectiveTimestampFromCore(
              cb,
              b.created_at != null ? String(b.created_at) : null,
            );
            return tb - ta;
          },
        ) as RefProjectRow[];

        const { data: extractedRows, error: exErr } = await supabase
          .from("report_extracted_data")
          .select("project_id, land_comps, sale_comps, rental_comps")
          .in(
            "project_id",
            sortedProjects.map((p) => p.id),
          );

        if (exErr) {
          phaseB.errors.push(`report_extracted_data load failed: ${exErr.message}`);
        }

        const extractedByProject = new Map<
          string,
          { land: ExtractedLandComp[]; sale: ExtractedSaleComp[]; rental: ExtractedRentalComp[] }
        >();

        for (const er of extractedRows ?? []) {
          const pid = er.project_id as string;
          extractedByProject.set(pid, {
            land: asExtractedLand(er.land_comps),
            sale: asExtractedSale(er.sale_comps),
            rental: asExtractedRental(er.rental_comps),
          });
        }

        const candidates: CompCandidate[] = [];

        for (const p of sortedProjects) {
          const pid = p.id;
          const ext = extractedByProject.get(pid);
          if (!ext) continue;

          for (const comp of ext.land) {
            candidates.push({
              address: comp.address,
              instrumentNumber: undefined,
              apn: undefined,
              type: "Land",
              projectId: pid,
              index: comp.index,
            });
          }
          for (const comp of ext.sale) {
            candidates.push({
              address: comp.address,
              instrumentNumber: undefined,
              apn: undefined,
              type: "Sales",
              projectId: pid,
              index: comp.index,
            });
          }
          for (const comp of ext.rental) {
            candidates.push({
              address: comp.address,
              instrumentNumber: undefined,
              apn: undefined,
              type: "Rentals",
              projectId: pid,
              index: comp.index,
            });
          }
        }

        const matchResult =
          refLibId && refLibraryCompsForMatch.length > 0
            ? matchComps(candidates, refLibraryCompsForMatch)
            : null;

        unmatchedCandidates = matchResult
          ? matchResult.unmatched
          : candidates.filter((c) => !refLibId || c.projectId !== refLibId);

        if (runB && refLibId && matchResult) {
          const rowByProject = new Map<string, RefProjectRow>(
            sortedProjects.map((r) => [r.id, r]),
          );

          for (const m of matchResult.matched) {
            if (m.candidate.projectId === refLibId) {
              continue;
            }
            const refComp = refLibCompsRows.find((c) => c.id === m.matchedRefCompId);
            if (!refComp) continue;

            const rawParsed = parsedByCompId.get(refComp.id);
            if (!rawParsed) {
              phaseB.errors.push(`No parsed data for ref comp ${refComp.id}`);
              continue;
            }

            const newCompId = uuidFromHash(
              `b:${m.candidate.projectId}:${m.matchedRefCompId}:${m.candidate.type}`,
            );

            const projRow = rowByProject.get(m.candidate.projectId);
            const folderId = await findCompFolderId(
              driveToken,
              projRow?.folder_structure,
              m.candidate.type,
              refComp.address,
              folderCache,
            );

            const apnFromRaw = extractApnFromRawData(rawParsed);
            const compApn = apnFromRaw.length > 0 ? apnFromRaw : (refComp.apn ?? []);
            let compImages = refComp.images ?? [];
            if (folderId && driveToken && (!Array.isArray(compImages) || compImages.length === 0)) {
              compImages = await listCompImages(driveToken, folderId);
            }

            const { error: insCompErr } = await supabase.from("comparables").upsert(
              {
                id: newCompId,
                project_id: m.candidate.projectId,
                type: m.candidate.type,
                number: String(m.candidate.index ?? 1),
                address: refComp.address,
                address_for_display: refComp.address_for_display ?? refComp.address,
                apn: compApn,
                instrument_number: refComp.instrument_number ?? null,
                folder_id: folderId,
                images: compImages,
                parsed_data_status: "parsed",
              },
              { onConflict: "id" },
            );

            if (insCompErr) {
              phaseB.errors.push(`Insert comparable ${newCompId}: ${insCompErr.message}`);
              continue;
            }

            const { error: insPdErr } = await supabase.from("comp_parsed_data").upsert(
              {
                comp_id: newCompId,
                project_id: m.candidate.projectId,
                raw_data: rawParsed,
                source: "backfill",
                parsed_at: new Date().toISOString(),
              },
              { onConflict: "comp_id" },
            );

            if (insPdErr) {
              phaseB.errors.push(`Insert comp_parsed_data ${newCompId}: ${insPdErr.message}`);
              continue;
            }

            phaseB.compsAssigned++;

            await supabase.from("comp_parcel_improvements").delete().eq("comp_id", newCompId);
            await supabase.from("comp_parcels").delete().eq("comp_id", newCompId);

            const oldParcels = parcelsByCompId.get(refComp.id) ?? [];
            const oldParcelIdToNew = new Map<string, string>();

            for (const parcel of oldParcels) {
              const oldPid = parcel.id as string | undefined;
              const insertPayload = {
                comp_id: newCompId,
                project_id: m.candidate.projectId,
                instrument_number: parcel.instrument_number ?? null,
                apn: (parcel.apn as string) ?? "",
                apn_link: (parcel.apn_link as string) ?? "",
                location: (parcel.location as string) ?? "",
                legal: (parcel.legal as string) ?? "",
                lot_number: parcel.lot_number ?? null,
                size_ac: parcel.size_ac ?? null,
                size_sf: parcel.size_sf ?? null,
                building_size_sf: parcel.building_size_sf ?? null,
                office_area_sf: parcel.office_area_sf ?? null,
                warehouse_area_sf: parcel.warehouse_area_sf ?? null,
                parking_sf: parcel.parking_sf ?? null,
                storage_area_sf: parcel.storage_area_sf ?? null,
                buildings: parcel.buildings ?? null,
                total_tax_amount: parcel.total_tax_amount ?? null,
                county_appraised_value: parcel.county_appraised_value ?? null,
              };

              const { data: newP, error: pInsErr } = await supabase
                .from("comp_parcels")
                .insert(insertPayload)
                .select("id")
                .single();

              if (pInsErr ?? !newP) {
                phaseB.errors.push(`comp_parcels copy: ${pInsErr?.message ?? "unknown"}`);
                continue;
              }
              phaseB.parcelsCreated++;
              if (oldPid) {
                oldParcelIdToNew.set(oldPid, newP.id as string);
              }
            }

            const oldImps = improvementsByCompId.get(refComp.id) ?? [];
            for (const imp of oldImps) {
              const oldParcelId = imp.parcel_id as string | undefined;
              const newParcelId =
                oldParcelId && oldParcelIdToNew.has(oldParcelId)
                  ? oldParcelIdToNew.get(oldParcelId)!
                  : oldParcelId ?? null;

              const { error: impInsErr } = await supabase.from("comp_parcel_improvements").insert({
                parcel_id: newParcelId,
                comp_id: newCompId,
                project_id: m.candidate.projectId,
                instrument_number: imp.instrument_number ?? null,
                apn: (imp.apn as string) ?? "",
                building_number: (imp.building_number as number) ?? 1,
                section_number: (imp.section_number as number) ?? 1,
                year_built: imp.year_built ?? null,
                effective_year_built: imp.effective_year_built ?? null,
                gross_building_area_sf: imp.gross_building_area_sf ?? null,
                office_area_sf: imp.office_area_sf ?? null,
                warehouse_area_sf: imp.warehouse_area_sf ?? null,
                parking_sf: imp.parking_sf ?? null,
                storage_area_sf: imp.storage_area_sf ?? null,
                is_gla: imp.is_gla ?? true,
                construction: (imp.construction as string) ?? "",
                comments: imp.comments ?? null,
              });

              if (impInsErr) {
                phaseB.errors.push(`comp_parcel_improvements copy: ${impInsErr.message}`);
              } else {
                phaseB.improvementsCreated++;
              }
            }
          }
        }

        if (runC) {
          const extractedByPid = extractedByProject;

          for (const cand of unmatchedCandidates) {
            if (cand.projectId === refLibId) continue;

            const ext = extractedByPid.get(cand.projectId);
            if (!ext) continue;

            let extractedRow: ExtractedLandComp | ExtractedSaleComp | ExtractedRentalComp | null =
              null;
            if (cand.type === "Land") {
              extractedRow =
                ext.land.find((x) => x.index === cand.index) ??
                ext.land.find(
                  (x) => normalizeAddress(x.address) === normalizeAddress(cand.address),
                ) ??
                null;
            } else if (cand.type === "Sales") {
              extractedRow =
                ext.sale.find((x) => x.index === cand.index) ??
                ext.sale.find(
                  (x) => normalizeAddress(x.address) === normalizeAddress(cand.address),
                ) ??
                null;
            } else {
              extractedRow =
                ext.rental.find((x) => x.index === cand.index) ??
                ext.rental.find(
                  (x) => normalizeAddress(x.address) === normalizeAddress(cand.address),
                ) ??
                null;
            }

            if (!extractedRow) {
              phaseC.errors.push(
                `Phase C: missing extracted row for project ${cand.projectId} ${cand.type} #${cand.index}`,
              );
              continue;
            }

            const newCompId = uuidFromHash(
              `c:${cand.projectId}:${cand.type}:${cand.index}:${normalizeAddress(cand.address)}`,
            );

            const projRow = await supabase
              .from("projects")
              .select("folder_structure")
              .eq("id", cand.projectId)
              .maybeSingle();

            const folderId = await findCompFolderId(
              driveToken,
              projRow.data?.folder_structure,
              cand.type,
              cand.address,
              folderCache,
            );

            const { error: cInsErr } = await supabase.from("comparables").upsert(
              {
                id: newCompId,
                project_id: cand.projectId,
                type: cand.type,
                number: String(cand.index ?? 1),
                address: cand.address,
                address_for_display: cand.address,
                apn: [],
                instrument_number: null,
                folder_id: folderId,
                images: [],
                parsed_data_status: "parsed",
              },
              { onConflict: "id" },
            );

            if (cInsErr) {
              phaseC.errors.push(`Phase C comparable ${newCompId}: ${cInsErr.message}`);
              continue;
            }

            const rawData = mapExtractedToRawData(extractedRow, cand.type);

            const { error: pdErr } = await supabase.from("comp_parsed_data").upsert(
              {
                comp_id: newCompId,
                project_id: cand.projectId,
                raw_data: rawData,
                source: "extracted",
                parsed_at: new Date().toISOString(),
              },
              { onConflict: "comp_id" },
            );

            if (pdErr) {
              phaseC.errors.push(`Phase C comp_parsed_data ${newCompId}: ${pdErr.message}`);
              continue;
            }

            phaseC.compsCreated++;
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      phaseB.errors.push(`Phase B/C fatal: ${msg}`);
      phaseC.errors.push(`Phase B/C fatal: ${msg}`);
      console.error(`${TAG} Phase B/C fatal`, e);
    }
  }

  if (runD) {
    try {
      let dq = supabase
        .from("projects")
        .select("id, created_at")
        .eq("is_reference", true);

      if (singleProjectId) {
        dq = dq.eq("id", singleProjectId);
      }

      const { data: refProjList, error: dErr } = await dq;
      if (dErr) {
        phaseD = { historicalMarked: 0 };
        phaseB.errors.push(`Phase D: project query ${dErr.message}`);
      } else {
        const refIds = new Set((refProjList ?? []).map((r) => r.id as string));
        const { data: comps, error: cErr } = await supabase
          .from("comparables")
          .select("id, project_id, address, type")
          .in("project_id", [...refIds]);

        if (cErr) {
          phaseB.errors.push(`Phase D: comparables ${cErr.message}`);
        } else {
          const pidList = [...refIds];
          const { data: subs } = await supabase
            .from("subject_data")
            .select("project_id, core")
            .in("project_id", pidList);

          const coreMap = new Map<string, Record<string, unknown>>();
          const createdMap = new Map<string, string>();
          for (const p of refProjList ?? []) {
            createdMap.set(p.id as string, (p.created_at as string) ?? "");
          }
          for (const s of subs ?? []) {
            const pid = s.project_id as string;
            const c = s.core as Record<string, unknown> | null;
            if (c) coreMap.set(pid, c);
          }

          const projectEffective = new Map<string, number>();
          for (const pid of refIds) {
            projectEffective.set(
              pid,
              effectiveTimestampFromCore(
                coreMap.get(pid),
                createdMap.get(pid),
              ),
            );
          }

          type CompEntry = {
            id: string;
            projectId: string;
            eff: number;
          };

          const byKey = new Map<string, CompEntry[]>();
          for (const c of comps ?? []) {
            const addr = normalizeAddress((c.address as string) ?? "");
            const typ = c.type as string;
            const key = `${addr}|${typ}`;
            const pid = c.project_id as string;
            const list = byKey.get(key) ?? [];
            list.push({
              id: c.id as string,
              projectId: pid,
              eff: projectEffective.get(pid) ?? 0,
            });
            byKey.set(key, list);
          }

          const losers = new Set<string>();
          for (const [, arr] of byKey) {
            if (arr.length < 2) continue;
            const sorted = [...arr].sort((a, b) => {
              if (b.eff !== a.eff) return b.eff - a.eff;
              return a.id.localeCompare(b.id);
            });
            const winnerId = sorted[0]!.id;
            for (let i = 1; i < sorted.length; i++) {
              const sid = sorted[i]!.id;
              if (sid !== winnerId) losers.add(sid);
            }
          }

          for (const compId of losers) {
            const { data: updatedRows, error: uErr } = await supabase
              .from("comp_parsed_data")
              .update({ source: "historical" })
              .eq("comp_id", compId)
              .in("source", ["backfill", "extracted"])
              .select("id");

            if (!uErr && updatedRows && updatedRows.length > 0) {
              phaseD.historicalMarked += updatedRows.length;
            }
          }

          console.log(
            `${TAG} Phase D: marked ${phaseD.historicalMarked} comp_parsed_data rows historical`,
          );
        }
      }
    } catch (e) {
      console.error(`${TAG} Phase D fatal`, e);
    }
  }

  const phaseE = { apnPatched: 0, folderFound: 0, imagesFound: 0, errors: [] as string[] };

  if (runE) {
    try {
      console.log(`${TAG} Phase E: Enriching comps (APN, folder_id, images)`);

      let eq = supabase
        .from("projects")
        .select("id, folder_structure")
        .eq("is_reference", true);
      if (singleProjectId) {
        eq = eq.eq("id", singleProjectId);
      }
      const { data: refProjs } = await eq;
      const refProjIds = (refProjs ?? []).map((p) => p.id as string);
      const fsByProject = new Map<string, unknown>();
      for (const p of refProjs ?? []) {
        fsByProject.set(p.id as string, p.folder_structure);
      }

      if (refProjIds.length > 0) {
        const { data: allComps, error: compErr } = await supabase
          .from("comparables")
          .select("id, project_id, address, type, apn, folder_id, images")
          .in("project_id", refProjIds);

        if (compErr) {
          phaseE.errors.push(`Phase E comps query: ${compErr.message}`);
        } else {
          const comps = (allComps ?? []) as PhaseECompRow[];
          const compIds = comps.map((c) => c.id);
          const { data: parsedRows } = await supabase
            .from("comp_parsed_data")
            .select("comp_id, raw_data")
            .in("comp_id", compIds);

          const rawByComp = new Map<string, Record<string, unknown>>();
          for (const pr of parsedRows ?? []) {
            if (pr.comp_id) {
              rawByComp.set(pr.comp_id as string, (pr.raw_data as Record<string, unknown>) ?? {});
            }
          }

          for (const comp of comps) {
            const cid = comp.id;
            const pid = comp.project_id;
            const raw = rawByComp.get(cid) ?? {};
            const existingApn = comp.apn;
            const existingFolderId = comp.folder_id;
            const existingImages = comp.images;
            const compAddress = comp.address;
            const compType = comp.type as CompCandidate["type"];

            const updates: Record<string, unknown> = {};

            const apnEmpty = !existingApn || (Array.isArray(existingApn) && existingApn.length === 0);
            if (apnEmpty) {
              const apnFromRaw = extractApnFromRawData(raw);
              if (apnFromRaw.length > 0) {
                updates.apn = apnFromRaw;
                phaseE.apnPatched++;
              }
            }

            let folderId = existingFolderId;
            if (!folderId && driveToken) {
              folderId = await findCompFolderId(
                driveToken,
                fsByProject.get(pid),
                compType,
                compAddress,
                folderCache,
              );
              if (folderId) {
                updates.folder_id = folderId;
                phaseE.folderFound++;
              }
            }

            const imagesEmpty = !existingImages || (Array.isArray(existingImages) && existingImages.length === 0);
            if (imagesEmpty && folderId && driveToken) {
              const images = await listCompImages(driveToken, folderId);
              if (images.length > 0) {
                updates.images = images;
                phaseE.imagesFound += images.length;
              }
            }

            if (Object.keys(updates).length > 0) {
              const { error: upErr } = await supabase
                .from("comparables")
                .update(updates)
                .eq("id", cid);
              if (upErr) {
                phaseE.errors.push(`Phase E update ${cid}: ${upErr.message}`);
              }
            }
          }
        }
      }
      console.log(
        `${TAG} Phase E: patched ${phaseE.apnPatched} APNs, found ${phaseE.folderFound} folders, ${phaseE.imagesFound} images`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      phaseE.errors.push(`Phase E fatal: ${msg}`);
      console.error(`${TAG} Phase E fatal`, e);
    }
  }

  const elapsed_ms = Date.now() - started;

  return NextResponse.json({
    ok: true,
    phaseA,
    phaseB,
    phaseC,
    phaseD,
    phaseE,
    elapsed_ms,
  });
}
