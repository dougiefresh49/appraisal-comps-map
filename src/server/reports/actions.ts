import "server-only";

import { z } from "zod";
import { env } from "~/env";

export const reportSectionSchema = z.enum([
  "neighborhood",
  "zoning",
  "subject-site-summary",
  "highest-best-use",
  "ownership",
]);

export const reportActionSchema = z.enum([
  "generate",
  "get",
  "update",
  "regenerate",
]);

export type ReportSection = z.infer<typeof reportSectionSchema>;
export type ReportAction = z.infer<typeof reportActionSchema>;

const ReportRequestSchema = z.object({
  projectFolderId: z.string().min(1, "projectFolderId is required"),
  action: reportActionSchema,
  section: reportSectionSchema,
  content: z.string().optional(),
  previousContent: z.string().optional(),
  regenerationContext: z.string().optional(),
});

export type ReportRequest = z.infer<typeof ReportRequestSchema>;

export interface ReportContentResult {
  ok: boolean;
  content: string | null;
  exists?: boolean | null;
  status?: number;
  error?: string;
}

const CONTENT_KEY = "content";
const EXISTS_KEY = "exists";
const STATUS_KEY = "status";

function getWebhookUrl(): string {
  const base = env.N8N_WEBHOOK_BASE_URL || env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL;
  if (!base) {
    throw new Error("N8N_WEBHOOK_BASE_URL is not configured");
  }
  return base.endsWith("/")
    ? `${base}report-content`
    : `${base}/report-content`;
}

function extractPayload(payload: unknown): {
  content: string | null;
  exists: boolean | null;
  status?: string;
} {
  if (Array.isArray(payload) && payload.length > 0) {
    const first = payload[0] as Record<string, unknown>;
    const content =
      typeof first?.[CONTENT_KEY] === "string"
        ? (first[CONTENT_KEY] as string)
        : null;
    const exists =
      typeof first?.[EXISTS_KEY] === "boolean"
        ? (first[EXISTS_KEY] as boolean)
        : null;
    const status =
      typeof first?.[STATUS_KEY] === "string"
        ? (first[STATUS_KEY] as string)
        : undefined;
    return { content, exists, status };
  }
  if (payload && typeof payload === "object") {
    const data = payload as Record<string, unknown>;
    const content =
      typeof data[CONTENT_KEY] === "string"
        ? (data[CONTENT_KEY] as string)
        : null;
    const exists =
      typeof data[EXISTS_KEY] === "boolean"
        ? (data[EXISTS_KEY] as boolean)
        : null;
    const status =
      typeof data[STATUS_KEY] === "string"
        ? (data[STATUS_KEY] as string)
        : undefined;
    return { content, exists, status };
  }
  return { content: null, exists: null };
}

export async function runReportAction(
  input: ReportRequest,
): Promise<ReportContentResult> {
  const parsed = ReportRequestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      content: null,
      error: parsed.error.message,
      status: 400,
    };
  }

  const url = getWebhookUrl();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parsed.data),
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        content: null,
        status: response.status,
        error: `Webhook returned ${response.status}: ${body || response.statusText}`,
      };
    }

    const payload = await response.json();
    const { content, exists, status } = extractPayload(payload);

    return {
      ok: true,
      content,
      exists: exists ?? (content ? true : false),
      status: response.status,
      error: status === "not_found" ? "Content not found" : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      content: null,
      status: 500,
      error:
        error instanceof Error
          ? error.message
          : "Failed to reach report webhook",
    };
  }
}
