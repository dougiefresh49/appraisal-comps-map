import "server-only";

import { Type, type FunctionDeclaration } from "@google/genai";
import { createClient } from "~/utils/supabase/server";

// ---------------------------------------------------------------------------
// Tool declarations for Gemini function calling
// ---------------------------------------------------------------------------

// --- Read tools ---

const querySubjectData: FunctionDeclaration = {
  name: "query_subject_data",
  description:
    "Retrieve a specific section of the subject property data for the current project. Use this to look up any subject data field before answering a question about it. Returns the raw JSON for the requested section.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      section: {
        type: Type.STRING,
        description:
          "Which section of subject_data to retrieve: 'core' for main property fields (address, land size, year built, zoning, etc.), 'taxes' for tax data, 'parcels' for parcel-level data, 'improvements' for building improvements, 'fema' for flood data, 'improvement_analysis' for improvement analysis.",
        enum: ["core", "taxes", "parcels", "improvements", "fema", "improvement_analysis"],
      },
    },
    required: ["section"],
  },
};

const listProjectComps: FunctionDeclaration = {
  name: "list_project_comps",
  description:
    "List all comparables for the current project. Returns id, address, type, and number for each comp. Use this to discover comp IDs before calling query_comp_data.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      type_filter: {
        type: Type.STRING,
        description:
          "Optional: filter by comp type (e.g. 'land', 'sales', 'rentals'). Omit to return all comps.",
      },
    },
  },
};

const queryCompData: FunctionDeclaration = {
  name: "query_comp_data",
  description:
    "Retrieve the full parsed data for a comparable. Use this when asked about a specific comp's fields (sale price, land size, year built, etc.) that aren't already in the conversation context. You can look up by comp_id UUID or by an address substring.",
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

export const toolConfig = {
  functionDeclarations: [
    querySubjectData,
    listProjectComps,
    queryCompData,
    updateSubjectField,
    updateCompField,
    updateParcelField,
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

async function executeQuerySubjectData(
  args: Record<string, string>,
  projectId: string,
): Promise<ToolCallResult> {
  const { section } = args;
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
    .eq("project_id", projectId)
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
  projectId: string,
): Promise<ToolCallResult> {
  const supabase = await createClient();

  let query = supabase
    .from("comparables")
    .select("id, address, address_for_display, type, number")
    .eq("project_id", projectId)
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
    id: c.id,
    address: (c.address_for_display as string) || (c.address as string),
    type: c.type,
    number: c.number,
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
  projectId: string,
): Promise<ToolCallResult> {
  const { comp_id, address_search } = args;

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
      .eq("project_id", projectId)
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
    message: `Retrieved data for comp: ${(comp.address_for_display as string) || (comp.address as string)}`,
    data: {
      id: comp.id,
      address: (comp.address_for_display as string) || (comp.address as string),
      type: comp.type,
      number: comp.number,
      raw_data: parsed?.raw_data ?? null,
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
