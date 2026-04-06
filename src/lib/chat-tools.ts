import "server-only";

import { Type, type FunctionDeclaration } from "@google/genai";
import { createClient } from "~/utils/supabase/server";

// ---------------------------------------------------------------------------
// Tool declarations for Gemini function calling
// ---------------------------------------------------------------------------

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
  functionDeclarations: [updateSubjectField, updateCompField, updateParcelField],
};

// ---------------------------------------------------------------------------
// Tool result type sent to the client via SSE
// ---------------------------------------------------------------------------

export interface ToolCallResult {
  toolName: string;
  args: Record<string, string>;
  success: boolean;
  message: string;
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
