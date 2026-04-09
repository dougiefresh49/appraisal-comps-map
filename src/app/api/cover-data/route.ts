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
  projectFolderId: string;
  subjectPhotosFolderId?: string;
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
    const { projectFolderId } = body;
    let { subjectPhotosFolderId } = body;

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

    // Try to find the Subject Front photo from Supabase photo_analyses
    let coverFileId: string | null = null;

    const supabase = await createClient();
    const { data: photoRows } = await supabase
      .from("photo_analyses")
      .select("file_id")
      .eq("label", "Subject Front")
      .not("file_id", "is", null)
      .limit(1);

    if (photoRows && photoRows.length > 0) {
      coverFileId = (photoRows[0] as { file_id: string }).file_id;
    }

    // Fallback: look for the first image in the photos folder directly
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
