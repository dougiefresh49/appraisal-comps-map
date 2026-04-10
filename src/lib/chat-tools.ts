import "server-only";

import { Type, type FunctionDeclaration } from "@google/genai";
import type { AdjustmentPatchInput } from "~/server/adjustment-grid-chat";
import { createClient } from "~/utils/supabase/server";

// ---------------------------------------------------------------------------
// Tool declarations for Gemini function calling
// ---------------------------------------------------------------------------

// --- Read tools ---

const searchAllProjects: FunctionDeclaration = {
  name: "search_all_projects",
  description:
    "Search across ALL appraisal projects/reports in the database, including past (reference) reports. Each row in the projects table represents one appraisal report. Past reports have is_reference=true and contain historical comparables. Use this when the user asks about a property, report, or historical/past comps. Returns project id, name, subject address, property type, and whether it is a reference report. Call this first to get project_id(s), then use list_project_comps or query_comp_data with that project_id.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      address_search: {
        type: Type.STRING,
        description:
          "Partial address or street name to search for across all projects (case-insensitive).",
      },
      name_search: {
        type: Type.STRING,
        description:
          "Partial project name to search for (case-insensitive).",
      },
      property_type_search: {
        type: Type.STRING,
        description:
          "Filter by property type (e.g. 'office', 'warehouse', 'retail', 'industrial'). Case-insensitive partial match.",
      },
      include_reference: {
        type: Type.STRING,
        description:
          "Set to 'true' to include past/reference reports, 'only' to return ONLY reference reports, or 'false' (default) for active projects only. When the user asks about 'past reports', 'old reports', or 'historical comps', set this to 'true' or 'only'.",
        enum: ["true", "false", "only"],
      },
    },
  },
};

const querySubjectData: FunctionDeclaration = {
  name: "query_subject_data",
  description:
    "Retrieve a specific section of the subject property data. Defaults to the current active project, but you can pass a project_id to query any other project. Use this to look up any subject data field before answering a question about it. Returns the raw JSON for the requested section.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      section: {
        type: Type.STRING,
        description:
          "Which section of subject_data to retrieve: 'core' for main property fields (address, land size, year built, zoning, etc.), 'taxes' for tax data, 'parcels' for parcel-level data, 'improvements' for building improvements, 'fema' for flood data, 'improvement_analysis' for improvement analysis.",
        enum: ["core", "taxes", "parcels", "improvements", "fema", "improvement_analysis"],
      },
      project_id: {
        type: Type.STRING,
        description:
          "Optional UUID of a different project to query. Omit to query the current active project. Use search_all_projects first to find the project_id for another report.",
      },
    },
    required: ["section"],
  },
};

const listProjectComps: FunctionDeclaration = {
  name: "list_project_comps",
  description:
    "List all comparables for a project. Defaults to the current active project, but you can pass a project_id to list comps from any other project. Returns id, address, type, and number for each comp. Use this to discover comp IDs before calling query_comp_data.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      type_filter: {
        type: Type.STRING,
        description:
          "Optional: filter by comp type (e.g. 'land', 'sales', 'rentals'). Omit to return all comps.",
      },
      project_id: {
        type: Type.STRING,
        description:
          "Optional UUID of a different project to query. Omit to use the current active project.",
      },
    },
  },
};

const queryCompData: FunctionDeclaration = {
  name: "query_comp_data",
  description:
    "Retrieve the full parsed data for a comparable. Defaults to searching within the current active project, but you can pass a project_id to search in any other project. Use this when asked about a specific comp's fields (sale price, land size, year built, etc.) that aren't already in the conversation context. You can look up by comp_id UUID or by an address substring.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      comp_id: {
        type: Type.STRING,
        description: "The UUID of the comparable to retrieve. Use if you have the exact id.",
      },
      address_search: {
        type: Type.STRING,
        description:
          "A partial address string to search for (case-insensitive substring match). Use if you don't have the exact comp_id.",
      },
      project_id: {
        type: Type.STRING,
        description:
          "Optional UUID of a different project to search within. Omit to search in the current active project.",
      },
    },
  },
};

// --- Write tools ---

const updateSubjectField: FunctionDeclaration = {
  name: "update_subject_field",
  description:
    "Update a field on the subject property data. Use this when the user asks to save, set, or update a value on the subject. The field_name must match a known subject data field (e.g. 'County Appraised Value', 'Total Taxes', 'Zoning', 'Year Built', 'Building Size (SF)', etc). The section parameter determines which part of subject_data to update.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      section: {
        type: Type.STRING,
        description:
          "Which section of subject_data to update: 'core' for most fields, 'fema' for flood data.",
        enum: ["core", "fema"],
      },
      field_name: {
        type: Type.STRING,
        description:
          "The exact field name to update (e.g. 'County Appraised Value', 'Total Taxes', 'Zoning', 'City', 'Year Built').",
      },
      value: {
        type: Type.STRING,
        description:
          "The new value as a string. Numbers should be numeric strings (e.g. '96068'). Booleans should be 'true' or 'false'.",
      },
    },
    required: ["section", "field_name", "value"],
  },
};

const updateCompField: FunctionDeclaration = {
  name: "update_comp_field",
  description:
    "Update a field on a comparable's parsed data. Use this when the user asks to save, set, or update a value on a specific comp. The comp_id must be one of the comps referenced in the conversation.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      comp_id: {
        type: Type.STRING,
        description: "The UUID of the comparable to update.",
      },
      field_name: {
        type: Type.STRING,
        description:
          "The exact field name in comp_parsed_data.raw_data (e.g. 'Sale Price', 'Building Size (SF)', 'Year Built', 'Zoning').",
      },
      value: {
        type: Type.STRING,
        description: "The new value as a string.",
      },
    },
    required: ["comp_id", "field_name", "value"],
  },
};

const updateParcelField: FunctionDeclaration = {
  name: "update_parcel_field",
  description:
    "Update a field on one of the subject's parcels. Use when the user asks to save parcel-level data like County Appraised Value, Total Tax Amount, or Building Size (SF). Identify the parcel by APN.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      apn: {
        type: Type.STRING,
        description: "The APN of the parcel to update.",
      },
      field_name: {
        type: Type.STRING,
        description:
          "The field name on the parcel (e.g. 'County Appraised Value', 'Total Tax Amount', 'Building Size (SF)').",
      },
      value: {
        type: Type.STRING,
        description: "The new value as a string.",
      },
    },
    required: ["apn", "field_name", "value"],
  },
};

const queryAdjustmentGrid: FunctionDeclaration = {
  name: "query_adjustment_grid",
  description:
    "Read the land or sales adjustment grid for the current project: comparable numbers with IDs, row names (transaction + property adjustments), and each cell's qualitative label and percentage. Use before applying updates from a user-provided table so comp # columns match (Comp #1, #2, …).",
  parameters: {
    type: Type.OBJECT,
    properties: {
      comp_type: {
        type: Type.STRING,
        description:
          "'land' = land sales comparison adjustment grid; 'sales' = improved sales comparison grid.",
        enum: ["land", "sales"],
      },
    },
    required: ["comp_type"],
  },
};

const updateAdjustmentGrid: FunctionDeclaration = {
  name: "update_adjustment_grid",
  description:
    "Apply adjustment grid updates when the user supplies a table of qualitative + percentage adjustments per comparable column. Row names must match the grid (land property rows include Location, Land Size (SF), Surface, Utilities, Frontage; add Zoning or other rows as needed — new rows are created if missing). Percentages are stored as decimal fractions: 0.15 = 15%, -0.25 = -25%. Pass comp_number matching Comp # in the app (1, 2, 3, …). Call query_adjustment_grid first if comp IDs or row names are unclear. Saves to the same draft the Land/Sales Adjustments pages use.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      comp_type: {
        type: Type.STRING,
        enum: ["land", "sales"],
        description: "Which adjustment grid to update.",
      },
      updates_json: {
        type: Type.STRING,
        description:
          'JSON array of objects, e.g. [{"row":"Location","comp_number":1,"qualitative":"Inferior","percentage":0.15}]. Each object: row (string), comp_number (integer), qualitative (string: Inferior, Similar, Superior, etc.), percentage (number: use decimal 0.15 for 15%; values like 15 are treated as 15%).',
      },
    },
    required: ["comp_type", "updates_json"],
  },
};

export const toolConfig = {
  functionDeclarations: [
    searchAllProjects,
    querySubjectData,
    listProjectComps,
    queryCompData,
    queryAdjustmentGrid,
    updateSubjectField,
    updateCompField,
    updateParcelField,
    updateAdjustmentGrid,
  ],
};

// ---------------------------------------------------------------------------
// Tool result type sent to the client via SSE
// ---------------------------------------------------------------------------

export interface ToolCallResult {
  toolName: string;
  args: Record<string, string>;
  success: boolean;
  message: string;
  /** Data returned by read tools — not sent to client, only fed back to the model */
  data?: unknown;
  /** True for read-only tools that shouldn't show a UI result bubble */
  silent?: boolean;
}

// ---------------------------------------------------------------------------
// Tool execution
// ---------------------------------------------------------------------------

function coerceValue(raw: string): unknown {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  const num = Number(raw);
  if (!Number.isNaN(num) && raw.trim() !== "") return num;
  return raw;
}

export async function executeToolCall(
  toolName: string,
  args: Record<string, string>,
  projectId: string,
): Promise<ToolCallResult> {
  try {
    switch (toolName) {
      case "search_all_projects":
        return await executeSearchAllProjects(args);
      case "query_subject_data":
        return await executeQuerySubjectData(args, projectId);
      case "list_project_comps":
        return await executeListProjectComps(args, projectId);
      case "query_comp_data":
        return await executeQueryCompData(args, projectId);
      case "update_subject_field":
        return await executeUpdateSubjectField(args, projectId);
      case "update_comp_field":
        return await executeUpdateCompField(args);
      case "update_parcel_field":
        return await executeUpdateParcelField(args, projectId);
      case "query_adjustment_grid":
        return await executeQueryAdjustmentGrid(args, projectId);
      case "update_adjustment_grid":
        return await executeUpdateAdjustmentGrid(args, projectId);
      default:
        return {
          toolName,
          args,
          success: false,
          message: `Unknown tool: ${toolName}`,
        };
    }
  } catch (err) {
    return {
      toolName,
      args,
      success: false,
      message: err instanceof Error ? err.message : "Tool execution failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Read tool implementations
// ---------------------------------------------------------------------------

async function executeSearchAllProjects(
  args: Record<string, string>,
): Promise<ToolCallResult> {
  const { address_search, name_search, property_type_search, include_reference } = args;

  if (!address_search && !name_search && !property_type_search && include_reference !== "only") {
    return {
      toolName: "search_all_projects",
      args,
      success: false,
      message: "Provide at least one of: address_search, name_search, or property_type_search",
      silent: true,
    };
  }

  const supabase = await createClient();

  let query = supabase
    .from("projects")
    .select("id, name, property_type, is_reference, subject_data(core)")
    .is("archived_at", null);

  if (include_reference === "only") {
    query = query.eq("is_reference", true);
  } else if (include_reference !== "true") {
    query = query.or("is_reference.is.null,is_reference.eq.false");
  }

  const { data, error } = await query;

  if (error) {
    return {
      toolName: "search_all_projects",
      args,
      success: false,
      message: `Database error: ${error.message}`,
      silent: true,
    };
  }

  const addrLower = address_search?.toLowerCase();
  const nameLower = name_search?.toLowerCase();
  const typeLower = property_type_search?.toLowerCase();

  type ProjectRow = {
    id: string;
    name: string | null;
    property_type: string | null;
    is_reference: boolean | null;
    subject_data: { core: Record<string, unknown> } | { core: Record<string, unknown> }[] | null;
  };

  const matches = ((data ?? []) as ProjectRow[])
    .filter((row) => (row.name ?? "").toLowerCase() !== "reference library")
    .map((row) => {
      const sd = row.subject_data;
      const core: Record<string, unknown> | null = sd == null
        ? null
        : Array.isArray(sd)
          ? (sd[0]?.core ?? null)
          : sd.core ?? null;
      const address = typeof core?.Address === "string" ? core.Address : "";
      const city = typeof core?.City === "string" ? core.City : "";
      return {
        id: row.id,
        name: row.name,
        address,
        city,
        property_type: row.property_type,
        is_reference: row.is_reference === true,
      };
    })
    .filter((r) => {
      const hasSearch = addrLower ?? nameLower ?? typeLower;
      if (!hasSearch && include_reference === "only") return true;

      const addressMatch = addrLower
        ? r.address.toLowerCase().includes(addrLower) ||
          r.city.toLowerCase().includes(addrLower)
        : false;
      const nameMatch = nameLower
        ? (r.name ?? "").toLowerCase().includes(nameLower)
        : false;
      const typeMatch = typeLower
        ? (r.property_type ?? "").toLowerCase().includes(typeLower)
        : false;
      return addressMatch || nameMatch || typeMatch;
    });

  return {
    toolName: "search_all_projects",
    args,
    success: true,
    message: `Found ${matches.length} matching project(s)${include_reference === "only" ? " (reference/past reports)" : include_reference === "true" ? " (including past reports)" : ""}`,
    data: matches,
    silent: true,
  };
}

async function executeQuerySubjectData(
  args: Record<string, string>,
  activeProjectId: string,
): Promise<ToolCallResult> {
  const { section, project_id } = args;
  const targetProjectId = project_id ?? activeProjectId;
  if (!section) {
    return {
      toolName: "query_subject_data",
      args,
      success: false,
      message: "Missing required argument: section",
      silent: true,
    };
  }

  const validSections = ["core", "taxes", "parcels", "improvements", "fema", "improvement_analysis"];
  if (!validSections.includes(section)) {
    return {
      toolName: "query_subject_data",
      args,
      success: false,
      message: `Invalid section: ${section}. Must be one of: ${validSections.join(", ")}`,
      silent: true,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subject_data")
    .select(section)
    .eq("project_id", targetProjectId)
    .maybeSingle();

  if (error) {
    return {
      toolName: "query_subject_data",
      args,
      success: false,
      message: `Database error: ${error.message}`,
      silent: true,
    };
  }

  const sectionData = (data as Record<string, unknown> | null)?.[section] ?? null;

  return {
    toolName: "query_subject_data",
    args,
    success: true,
    message: `Retrieved subject_data.${section}`,
    data: sectionData,
    silent: true,
  };
}

async function executeListProjectComps(
  args: Record<string, string>,
  activeProjectId: string,
): Promise<ToolCallResult> {
  const targetProjectId = args.project_id ?? activeProjectId;
  const supabase = await createClient();

  let query = supabase
    .from("comparables")
    .select("id, address, address_for_display, type, number")
    .eq("project_id", targetProjectId)
    .order("number", { ascending: true });

  if (args.type_filter) {
    query = query.ilike("type", `%${args.type_filter}%`);
  }

  const { data, error } = await query;

  if (error) {
    return {
      toolName: "list_project_comps",
      args,
      success: false,
      message: `Database error: ${error.message}`,
      silent: true,
    };
  }

  const comps = (data ?? []).map((c) => ({
    id: c.id as string,
    address: (c.address_for_display as string | null) ?? (c.address as string),
    type: c.type as string,
    number: c.number as string | null,
  }));

  return {
    toolName: "list_project_comps",
    args,
    success: true,
    message: `Found ${comps.length} comparable(s)`,
    data: comps,
    silent: true,
  };
}

async function executeQueryCompData(
  args: Record<string, string>,
  activeProjectId: string,
): Promise<ToolCallResult> {
  const { comp_id, address_search } = args;
  const targetProjectId = args.project_id ?? activeProjectId;

  if (!comp_id && !address_search) {
    return {
      toolName: "query_comp_data",
      args,
      success: false,
      message: "Provide either comp_id or address_search",
      silent: true,
    };
  }

  const supabase = await createClient();

  // Resolve comp_id from address search if needed
  let resolvedCompId = comp_id;
  if (!resolvedCompId && address_search) {
    const { data: matches } = await supabase
      .from("comparables")
      .select("id, address, address_for_display")
      .eq("project_id", targetProjectId)
      .or(
        `address.ilike.%${address_search}%,address_for_display.ilike.%${address_search}%`,
      )
      .limit(1);

    if (!matches || matches.length === 0) {
      return {
        toolName: "query_comp_data",
        args,
        success: false,
        message: `No comparable found matching address: "${address_search}"`,
        silent: true,
      };
    }
    resolvedCompId = matches[0]!.id as string;
  }

  const { data: comp } = await supabase
    .from("comparables")
    .select("id, address, address_for_display, type, number")
    .eq("id", resolvedCompId!)
    .maybeSingle();

  const { data: parsed } = await supabase
    .from("comp_parsed_data")
    .select("raw_data")
    .eq("comp_id", resolvedCompId!)
    .maybeSingle();

  if (!comp) {
    return {
      toolName: "query_comp_data",
      args,
      success: false,
      message: `No comparable found with id: ${resolvedCompId}`,
      silent: true,
    };
  }

  return {
    toolName: "query_comp_data",
    args,
    success: true,
    message: `Retrieved data for comp: ${(comp.address_for_display as string | null) ?? (comp.address as string)}`,
    data: {
      id: comp.id as string,
      address: (comp.address_for_display as string | null) ?? (comp.address as string),
      type: comp.type as string,
      number: comp.number as string | null,
      raw_data: (parsed?.raw_data as Record<string, unknown> | null) ?? null,
    },
    silent: true,
  };
}

// ---------------------------------------------------------------------------
// Write tool implementations
// ---------------------------------------------------------------------------

async function executeUpdateSubjectField(
  args: Record<string, string>,
  projectId: string,
): Promise<ToolCallResult> {
  const { section, field_name, value } = args;
  if (!section || !field_name || value === undefined) {
    return {
      toolName: "update_subject_field",
      args,
      success: false,
      message: "Missing required arguments: section, field_name, value",
    };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("subject_data")
    .select(section)
    .eq("project_id", projectId)
    .maybeSingle();

  const row = existing as Record<string, unknown> | null;
  const currentSection =
    (row?.[section] as Record<string, unknown>) ?? {};
  const updated = { ...currentSection, [field_name]: coerceValue(value) };

  const { error } = await supabase
    .from("subject_data")
    .upsert(
      {
        project_id: projectId,
        [section]: updated,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id" },
    );

  if (error) {
    return {
      toolName: "update_subject_field",
      args,
      success: false,
      message: `Database error: ${error.message}`,
    };
  }

  return {
    toolName: "update_subject_field",
    args,
    success: true,
    message: `Updated subject ${section}.${field_name} = ${value}`,
  };
}

async function executeUpdateCompField(
  args: Record<string, string>,
): Promise<ToolCallResult> {
  const { comp_id, field_name, value } = args;
  if (!comp_id || !field_name || value === undefined) {
    return {
      toolName: "update_comp_field",
      args,
      success: false,
      message: "Missing required arguments: comp_id, field_name, value",
    };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("comp_parsed_data")
    .select("raw_data")
    .eq("comp_id", comp_id)
    .maybeSingle();

  if (!existing) {
    return {
      toolName: "update_comp_field",
      args,
      success: false,
      message: `No parsed data found for comp ${comp_id}`,
    };
  }

  const rawData = (existing.raw_data as Record<string, unknown>) ?? {};
  const updated = { ...rawData, [field_name]: coerceValue(value) };

  const { error } = await supabase
    .from("comp_parsed_data")
    .update({
      raw_data: updated,
      source: "chat",
      updated_at: new Date().toISOString(),
    })
    .eq("comp_id", comp_id);

  if (error) {
    return {
      toolName: "update_comp_field",
      args,
      success: false,
      message: `Database error: ${error.message}`,
    };
  }

  return {
    toolName: "update_comp_field",
    args,
    success: true,
    message: `Updated comp ${field_name} = ${value}`,
  };
}

async function executeUpdateParcelField(
  args: Record<string, string>,
  projectId: string,
): Promise<ToolCallResult> {
  const { apn, field_name, value } = args;
  if (!apn || !field_name || value === undefined) {
    return {
      toolName: "update_parcel_field",
      args,
      success: false,
      message: "Missing required arguments: apn, field_name, value",
    };
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("subject_data")
    .select("parcels")
    .eq("project_id", projectId)
    .maybeSingle();

  const parcels =
    (existing?.parcels as Array<Record<string, unknown>>) ?? [];
  const parcelIdx = parcels.findIndex(
    (p) => String(p.APN).trim() === apn.trim(),
  );

  if (parcelIdx === -1) {
    return {
      toolName: "update_parcel_field",
      args,
      success: false,
      message: `No parcel found with APN ${apn}`,
    };
  }

  parcels[parcelIdx] = {
    ...parcels[parcelIdx],
    [field_name]: coerceValue(value),
  };

  const { error } = await supabase
    .from("subject_data")
    .update({
      parcels,
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", projectId);

  if (error) {
    return {
      toolName: "update_parcel_field",
      args,
      success: false,
      message: `Database error: ${error.message}`,
    };
  }

  return {
    toolName: "update_parcel_field",
    args,
    success: true,
    message: `Updated parcel ${apn}: ${field_name} = ${value}`,
  };
}

async function executeQueryAdjustmentGrid(
  args: Record<string, string>,
  activeProjectId: string,
): Promise<ToolCallResult> {
  const compType = args.comp_type?.trim().toLowerCase();
  if (compType !== "land" && compType !== "sales") {
    return {
      toolName: "query_adjustment_grid",
      args,
      success: false,
      message: "comp_type must be \"land\" or \"sales\"",
      silent: true,
    };
  }

  const {
    loadOrBootstrapAdjustmentGrid,
    summarizeAdjustmentGridForChat,
  } = await import("~/server/adjustment-grid-chat");

  const { state, bootstrapped } = await loadOrBootstrapAdjustmentGrid(
    activeProjectId,
    compType,
  );
  const summary = summarizeAdjustmentGridForChat(state);

  return {
    toolName: "query_adjustment_grid",
    args,
    success: true,
    message: bootstrapped
      ? "Adjustment grid loaded (built from suggestions — no prior draft)."
      : "Adjustment grid draft loaded.",
    data: { ...summary, bootstrapped },
    silent: true,
  };
}

async function executeUpdateAdjustmentGrid(
  args: Record<string, string>,
  projectId: string,
): Promise<ToolCallResult> {
  const compType = args.comp_type?.trim().toLowerCase();
  const updatesJson = args.updates_json?.trim();

  if (compType !== "land" && compType !== "sales") {
    return {
      toolName: "update_adjustment_grid",
      args,
      success: false,
      message: "comp_type must be \"land\" or \"sales\"",
    };
  }

  if (!updatesJson) {
    return {
      toolName: "update_adjustment_grid",
      args,
      success: false,
      message: "updates_json is required",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(updatesJson) as unknown;
  } catch {
    return {
      toolName: "update_adjustment_grid",
      args,
      success: false,
      message: "updates_json must be valid JSON",
    };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return {
      toolName: "update_adjustment_grid",
      args,
      success: false,
      message: "updates_json must be a non-empty JSON array",
    };
  }

  const {
    loadOrBootstrapAdjustmentGrid,
    applyAdjustmentPatches,
    saveAdjustmentGridDraft,
    coercePercentageToDecimal,
  } = await import("~/server/adjustment-grid-chat");

  const patches: AdjustmentPatchInput[] = [];

  for (const item of parsed) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const o = item as Record<string, unknown>;
    const rowRaw =
      typeof o.row === "string"
        ? o.row
        : typeof o.Row === "string"
          ? o.Row
          : "";
    const row = rowRaw.trim();
    let compNum: number;
    if (typeof o.comp_number === "number" && Number.isFinite(o.comp_number)) {
      compNum = Math.trunc(o.comp_number);
    } else if (typeof o.comp_number === "string") {
      compNum = Number.parseInt(o.comp_number.trim(), 10);
    } else {
      compNum = NaN;
    }
    const qualitative =
      typeof o.qualitative === "string"
        ? o.qualitative
        : typeof o.Qualitative === "string"
          ? o.Qualitative
          : "";
    const pctRaw = o.percentage ?? o.pct ?? o.percent ?? o.Percentage;
    const percentage = coercePercentageToDecimal(pctRaw);

    if (!row || Number.isNaN(compNum)) {
      continue;
    }
    if (percentage === null) {
      return {
        toolName: "update_adjustment_grid",
        args,
        success: false,
        message: `Invalid percentage for row "${row}" comp #${compNum}: ${String(pctRaw)}`,
      };
    }
    patches.push({
      row,
      comp_number: compNum,
      qualitative,
      percentage,
    });
  }

  if (patches.length === 0) {
    return {
      toolName: "update_adjustment_grid",
      args,
      success: false,
      message:
        "No valid entries in updates_json (need row, comp_number, qualitative, percentage per item)",
    };
  }

  const { state: current, bootstrapped } =
    await loadOrBootstrapAdjustmentGrid(projectId, compType);
  const { next, warnings } = applyAdjustmentPatches(current, patches);
  const save = await saveAdjustmentGridDraft(projectId, compType, next);

  if (!save.ok) {
    return {
      toolName: "update_adjustment_grid",
      args,
      success: false,
      message: save.error ?? "Failed to save adjustment grid",
    };
  }

  let msg = `Updated ${patches.length} cell(s) on the ${compType} adjustment grid.`;
  if (bootstrapped) {
    msg +=
      " (Grid was created from AI suggestions because no saved draft existed.)";
  }
  if (warnings.length > 0) {
    msg += ` ${warnings.join(" ")}`;
  }

  return {
    toolName: "update_adjustment_grid",
    args,
    success: true,
    message: msg,
  };
}
