import { NextResponse } from "next/server";
import {
  type ReportRequest,
  runReportAction,
  reportActionSchema,
  reportSectionSchema,
} from "~/server/reports/actions";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ReportRequest>;

    const projectFolderId =
      typeof body.projectFolderId === "string" ? body.projectFolderId : "";
    const action = reportActionSchema.safeParse(body.action).success
      ? body.action!
      : undefined;
    const section = reportSectionSchema.safeParse(body.section).success
      ? body.section!
      : undefined;

    const content =
      typeof body.content === "string" && body.content.length > 0
        ? body.content
        : undefined;

    const previousContent =
      typeof body.previousContent === "string" &&
      body.previousContent.length > 0
        ? body.previousContent
        : undefined;

    const regenerationContext =
      typeof body.regenerationContext === "string" &&
      body.regenerationContext.length > 0
        ? body.regenerationContext
        : undefined;

    const result = await runReportAction({
      projectFolderId,
      action: action ?? "get",
      section: section ?? "neighborhood",
      content,
      previousContent,
      regenerationContext,
    });

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Failed to process request" },
        { status: result.status ?? 500 },
      );
    }

    return NextResponse.json({
      content: result.content ?? "",
      exists: result.exists ?? false,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected error handling report request",
      },
      { status: 500 },
    );
  }
}
