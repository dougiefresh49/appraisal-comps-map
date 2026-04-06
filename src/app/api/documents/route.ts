import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  addDocument,
  listProjectDocuments,
  reprocessDocument,
} from "~/server/documents/actions";
import { shareDriveFile } from "~/lib/drive-api";
import { getGoogleToken } from "~/utils/supabase/server";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json(
      { error: "projectId query param is required" },
      { status: 400 },
    );
  }

  try {
    const documents = await listProjectDocuments(projectId);
    return NextResponse.json({ documents });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list documents",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      return await handleFormData(request);
    }

    return await handleJson(request);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to process request",
      },
      { status: 500 },
    );
  }
}

async function handleFormData(request: NextRequest) {
  const formData = await request.formData();

  const projectId = formData.get("projectId") as string | null;
  const documentType = formData.get("documentType") as string | null;
  const documentLabel = formData.get("documentLabel") as string | null;
  const sectionTag = formData.get("sectionTag") as string | null;
  const file = formData.get("file") as File | null;

  if (!projectId || !documentType) {
    return NextResponse.json(
      { error: "projectId and documentType are required" },
      { status: 400 },
    );
  }

  if (!file) {
    return NextResponse.json(
      { error: "file is required for FormData uploads" },
      { status: 400 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const fileBuffer = Buffer.from(arrayBuffer);

  const result = await addDocument({
    projectId,
    documentType,
    documentLabel: documentLabel ?? undefined,
    sectionTag: sectionTag ?? undefined,
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    fileBuffer,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ documentId: result.documentId });
}

async function handleJson(request: NextRequest) {
  const body = (await request.json()) as {
    projectId?: string;
    documentType?: string;
    documentLabel?: string;
    sectionTag?: string;
    fileId?: string;
    fileName?: string;
    mimeType?: string;
    action?: string;
    documentId?: string;
  };

  if (body.action === "reprocess" && body.documentId) {
    const result = await reprocessDocument(body.documentId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, documentId: result.documentId });
  }

  if (!body.projectId || !body.documentType) {
    return NextResponse.json(
      { error: "projectId and documentType are required" },
      { status: 400 },
    );
  }

  if (body.fileId) {
    const { token, error: driveAuthError, code } = await getGoogleToken();
    if (!token) {
      return NextResponse.json(
        {
          error:
            driveAuthError ??
            "Not authenticated — please sign in to grant Drive access",
          code,
        },
        { status: 401 },
      );
    }
    await shareDriveFile(token, body.fileId);
  }

  const result = await addDocument({
    projectId: body.projectId,
    documentType: body.documentType,
    documentLabel: body.documentLabel,
    sectionTag: body.sectionTag,
    fileId: body.fileId,
    fileName: body.fileName,
    mimeType: body.mimeType,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ documentId: result.documentId });
}
