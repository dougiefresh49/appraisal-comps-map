import { NextResponse } from "next/server";
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
          project_id
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

    const { data: rawResults, error } = await compQuery;

    if (error) {
      return NextResponse.json(
        { error: "Search query failed: " + error.message },
        { status: 500 },
      );
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
      }
    >();

    // Build a set of unique project IDs to fetch project names
    const projectIdSet = new Set<string>();

    for (const row of rawResults) {
      const comp = Array.isArray(row.comparables)
        ? row.comparables[0]
        : row.comparables;
      if (!comp) continue;

      const address = ((comp as { address?: string }).address ?? "").trim();
      const normalizedAddress = address.toLowerCase();
      const projectId = row.project_id as string;

      if (projectId) projectIdSet.add(projectId);

      const existing = byAddress.get(normalizedAddress);
      if (existing) {
        if (!existing.project_ids.includes(projectId)) {
          existing.project_ids.push(projectId);
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
