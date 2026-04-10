import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "~/utils/supabase/server";
import { getGoogleToken } from "~/utils/supabase/server";
import {
  DriveAuthError,
  listFolderChildren,
  findChildByName,
  downloadFile,
} from "~/lib/drive-api";

interface CoverDataRequest {
  /** Required — cover image must come from this project's photos / analyses. */
  projectId: string;
  projectFolderId: string;
  subjectPhotosFolderId?: string;
}

/** Parse Drive `input.json` ([{ image, label }, …]) and resolve file id for "Subject Front". */
async function coverFileIdFromInputJson(
  token: string,
  subjectPhotosFolderId: string,
): Promise<string | null> {
  const inputMeta = await findChildByName(
    token,
    subjectPhotosFolderId,
    "input.json",
  );
  if (!inputMeta) {
    return null;
  }
  const buf = await downloadFile(token, inputMeta.id);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) {
    return null;
  }
  const entry = parsed.find((row) => {
    if (!row || typeof row !== "object") return false;
    const label = (row as { label?: unknown }).label;
    return (
      typeof label === "string" &&
      label.trim().toLowerCase() === "subject front"
    );
  }) as { image?: unknown } | undefined;
  const imageName = entry?.image;
  if (typeof imageName !== "string" || !imageName.trim()) {
    return null;
  }
  const imageFile = await findChildByName(
    token,
    subjectPhotosFolderId,
    imageName.trim(),
  );
  return imageFile?.id ?? null;
}

/**
 * POST /api/cover-data
 *
 * Discovers the subject photos folder if not provided, queries Supabase for the
 * "Subject Front" photo's file_id, downloads it from Drive, resizes it to
 * 960x612, and returns the result as a base64 JPEG string.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CoverDataRequest;
    const { projectId, projectFolderId } = body;
    let { subjectPhotosFolderId } = body;

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400 },
      );
    }

    if (!projectFolderId) {
      return NextResponse.json(
        { error: "projectFolderId is required" },
        { status: 400 },
      );
    }

    const { token, error: driveAuthError, code } = await getGoogleToken();
    if (!token) {
      return NextResponse.json(
        {
          error:
            driveAuthError ??
            "Not authenticated — please sign in again to grant Drive access",
          code,
        },
        { status: 401 },
      );
    }

    // Discover subjectPhotosFolderId if not already known
    if (!subjectPhotosFolderId) {
      const projectChildren = await listFolderChildren(token, projectFolderId, {
        foldersOnly: true,
      });

      const subjectFolder = projectChildren.find(
        (f) => f.name.toLowerCase() === "subject",
      );
      if (!subjectFolder) {
        return NextResponse.json(
          { error: "Could not find 'subject' folder in project Drive folder" },
          { status: 404 },
        );
      }

      const photosFolder = await findChildByName(
        token,
        subjectFolder.id,
        "photos",
        "application/vnd.google-apps.folder",
      );
      if (!photosFolder) {
        return NextResponse.json(
          {
            error:
              "Could not find 'photos' subfolder inside the subject folder",
          },
          { status: 404 },
        );
      }

      subjectPhotosFolderId = photosFolder.id;
    }

    // Try the Subject Front photo for *this project* only (photo_analyses)
    let coverFileId: string | null = null;

    const supabase = await createClient();
    const { data: photoRows } = await supabase
      .from("photo_analyses")
      .select("file_id")
      .eq("project_id", projectId)
      .eq("label", "Subject Front")
      .not("file_id", "is", null)
      .order("sort_order", { ascending: true })
      .limit(1);

    if (photoRows && photoRows.length > 0) {
      coverFileId = (photoRows[0] as { file_id: string }).file_id;
    }

    // Fallback: Drive input.json in subject/photos (labels from export / Apps Script)
    if (!coverFileId) {
      coverFileId = await coverFileIdFromInputJson(
        token,
        subjectPhotosFolderId,
      );
    }

    // Fallback: first image file in the photos folder
    if (!coverFileId) {
      const photoFiles = await listFolderChildren(
        token,
        subjectPhotosFolderId,
        { filesOnly: true },
      );
      const imageFile = photoFiles.find(
        (f) => f.mimeType.startsWith("image/"),
      );
      if (imageFile) {
        coverFileId = imageFile.id;
      }
    }

    if (!coverFileId) {
      return NextResponse.json(
        { subjectPhotosFolderId, subjectPhotoBase64: null },
      );
    }

    // Download and resize the cover photo
    const imageBuffer = await downloadFile(token, coverFileId);
    const resized = await sharp(Buffer.from(imageBuffer))
      .resize(960, 612, { fit: "cover", position: "center" })
      .jpeg({ quality: 85 })
      .toBuffer();

    const subjectPhotoBase64 = resized.toString("base64");

    return NextResponse.json({ subjectPhotoBase64, subjectPhotosFolderId });
  } catch (error) {
    if (error instanceof DriveAuthError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 401 },
      );
    }
    console.error("Error in /api/cover-data:", error);
    return NextResponse.json(
      { error: "Failed to load cover data" },
      { status: 500 },
    );
  }
}
