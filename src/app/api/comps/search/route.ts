import { NextResponse } from "next/server";
import { normalizeAddressForCompMatch } from "~/server/comps/address-match";
import { createClient } from "~/utils/supabase/server";

interface SearchRequestBody {
  query: string;
  type?: "Sales" | "Land" | "Rentals";
  limit?: number;
}

interface CompSearchResult {
  comp_id: string;
  comp_type: string;
  address: string;
  instrument_number: string | null;
  raw_data: Record<string, string>;
  projects_using: { project_id: string; project_name: string }[];
}

export async function POST(request: Request) {
  try {
    let body: SearchRequestBody;
    try {
      body = (await request.json()) as SearchRequestBody;
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 },
      );
    }

    const { query, type, limit = 50 } = body;

    if (!query || query.trim().length < 2) {
      return NextResponse.json(
        { error: "query must be at least 2 characters" },
        { status: 400 },
      );
    }

    const supabase = await createClient();
    const q = `%${query.trim()}%`;

    // ------------------------------------------------------------------
    // Search comp_parsed_data.raw_data for address or APN matches.
    // We use a raw SQL filter via supabase's .filter() with ILIKE on
    // the JSONB ->> operator.
    // ------------------------------------------------------------------
    let compQuery = supabase
      .from("comp_parsed_data")
      .select(
        `
        comp_id,
        project_id,
        raw_data,
        comparables!inner(
          id,
          type,
          address,
          instrument_number,
          project_id,
          folder_id
        )
      `,
      )
      .or(
        `raw_data->>Address.ilike.${q},raw_data->>APN.ilike.${q}`,
      )
      .limit(limit);

    if (type) {
      compQuery = compQuery.eq("comparables.type", type);
    }

    const { data: rawResultsInitial, error } = await compQuery;

    if (error) {
      return NextResponse.json(
        { error: "Search query failed: " + error.message },
        { status: 500 },
      );
    }

    let rawResults = rawResultsInitial;

    // Exclude comps that belong only to the aggregate "Reference Library" project.
    // Other is_reference projects (past reports) remain searchable.
    if (rawResults && rawResults.length > 0) {
      const projectIdSet = new Set<string>();
      for (const row of rawResults) {
        const pid = row.project_id as string | undefined;
        if (pid) projectIdSet.add(pid);
      }

      if (projectIdSet.size > 0) {
        const { data: projectRows } = await supabase
          .from("projects")
          .select("id, name")
          .in("id", Array.from(projectIdSet));

        const excludedProjectIds = new Set(
          (projectRows ?? [])
            .filter(
              (p) =>
                ((p.name as string) ?? "").trim().toLowerCase() ===
                "reference library",
            )
            .map((p) => p.id as string),
        );

        if (excludedProjectIds.size > 0) {
          rawResults = rawResults.filter(
            (row) => !excludedProjectIds.has(row.project_id as string),
          );
        }
      }
    }

    if (!rawResults || rawResults.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // ------------------------------------------------------------------
    // Group by address: collect all projects that used the same address.
    // ------------------------------------------------------------------
    const byAddress = new Map<
      string,
      {
        comp_id: string;
        comp_type: string;
        address: string;
        instrument_number: string | null;
        raw_data: Record<string, string>;
        project_ids: string[];
        has_folder_id: boolean;
      }
    >();

    function comparableHasFolderId(comp: {
      folder_id?: string | null;
    }): boolean {
      const f = comp.folder_id;
      return typeof f === "string" && f.trim() !== "";
    }

    // Build a set of unique project IDs to fetch project names
    const projectIdSet = new Set<string>();

    for (const row of rawResults) {
      const comp = Array.isArray(row.comparables)
        ? row.comparables[0]
        : row.comparables;
      if (!comp) continue;

      const address = ((comp as { address?: string }).address ?? "").trim();
      const normalizedAddress = normalizeAddressForCompMatch(address);
      const projectId = row.project_id as string;
      const newcomerHasFolder = comparableHasFolderId(
        comp as { folder_id?: string | null },
      );

      if (projectId) projectIdSet.add(projectId);

      const existing = byAddress.get(normalizedAddress);
      if (existing) {
        if (!existing.project_ids.includes(projectId)) {
          existing.project_ids.push(projectId);
        }
        // Prefer the comparable row that has `folder_id` so copy-from-comp uses Drive.
        if (!existing.has_folder_id && newcomerHasFolder) {
          existing.comp_id = row.comp_id as string;
          existing.has_folder_id = true;
          existing.comp_type = (comp as { type?: string }).type ?? "Sales";
          existing.address = address;
          existing.instrument_number =
            (comp as { instrument_number?: string }).instrument_number ?? null;
          existing.raw_data = (row.raw_data ?? {}) as Record<string, string>;
        }
      } else {
        byAddress.set(normalizedAddress, {
          comp_id: row.comp_id as string,
          comp_type: (comp as { type?: string }).type ?? "Sales",
          address,
          instrument_number:
            (comp as { instrument_number?: string }).instrument_number ?? null,
          raw_data: (row.raw_data ?? {}) as Record<string, string>,
          project_ids: projectId ? [projectId] : [],
          has_folder_id: newcomerHasFolder,
        });
      }
    }

    // ------------------------------------------------------------------
    // Fetch project names for all referenced project IDs
    // ------------------------------------------------------------------
    const projectNames = new Map<string, string>();

    if (projectIdSet.size > 0) {
      const { data: projects } = await supabase
        .from("projects")
        .select("id, name")
        .in("id", Array.from(projectIdSet));

      for (const project of projects ?? []) {
        projectNames.set(
          project.id as string,
          project.name as string,
        );
      }
    }

    // ------------------------------------------------------------------
    // Build final result list
    // ------------------------------------------------------------------
    const results: CompSearchResult[] = Array.from(byAddress.values()).map(
      (item) => ({
        comp_id: item.comp_id,
        comp_type: item.comp_type,
        address: item.address,
        instrument_number: item.instrument_number,
        raw_data: item.raw_data,
        projects_using: item.project_ids.map((pid) => ({
          project_id: pid,
          project_name: projectNames.get(pid) ?? pid,
        })),
      }),
    );

    return NextResponse.json({ results, total: results.length });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Comp search failed",
      },
      { status: 500 },
    );
  }
}
