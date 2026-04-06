import { NextResponse } from "next/server";
import { env } from "~/env";
import { listFolderChildren } from "~/lib/drive-api";
import { getGoogleToken } from "~/utils/supabase/server";

/**
 * Lists immediate child folders under the configured appraisal-project parent —
 * same data n8n `/projects-new` returned for the `/projects/new` picker.
 */
export async function GET() {
  const parentId = env.GOOGLE_DRIVE_APPRAISAL_PROJECTS_PARENT_FOLDER_ID;
  if (!parentId) {
    return NextResponse.json(
      {
        error:
          "Server missing GOOGLE_DRIVE_APPRAISAL_PROJECTS_PARENT_FOLDER_ID — set it to the Drive folder that contains your project root folders.",
      },
      { status: 503 },
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

  try {
    const folders = await listFolderChildren(token, parentId, {
      foldersOnly: true,
    });
    const projects = [...folders]
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      )
      .map((f) => ({ id: f.id, name: f.name }));
    return NextResponse.json({ projects });
  } catch (err) {
    console.error("list-drive-roots:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to list Drive folders",
      },
      { status: 500 },
    );
  }
}
