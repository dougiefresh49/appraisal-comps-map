import "server-only";
import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "~/utils/supabase/server";

interface ProjectFolderEntry {
  "Report PDF": string;
  "Project Name": string;
  "Folder Name": string;
  "Google Drive Folder ID": string;
}

function parseProjectFolderIds(): ProjectFolderEntry[] {
  const mdPath = path.join(
    process.cwd(),
    "docs",
    "past-reports",
    "project-folder-ids.md",
  );

  if (!fs.existsSync(mdPath)) {
    throw new Error("docs/past-reports/project-folder-ids.md not found");
  }

  const content = fs.readFileSync(mdPath, "utf-8");

  // Extract the JSON block between ```json and ```
  const jsonMatch = /```json\s*([\s\S]*?)```/.exec(content);
  if (!jsonMatch?.[1]) {
    throw new Error("Could not find JSON block in project-folder-ids.md");
  }

  return JSON.parse(jsonMatch[1]) as ProjectFolderEntry[];
}

export async function POST(request: Request) {
  try {
    let body: { force?: boolean } = {};
    try {
      const text = await request.text();
      if (text.trim()) {
        body = JSON.parse(text) as typeof body;
      }
    } catch {
      // empty body is fine
    }

    const force = body.force === true;

    const supabase = await createClient();
    const entries = parseProjectFolderIds();
    const pastReportsDir = path.join(process.cwd(), "docs", "past-reports");

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

    const n8nWebhookBase = process.env.N8N_WEBHOOK_BASE_URL ?? "";

    const results: {
      projectName: string;
      project_id: string;
      action: "created" | "existing";
      pdfBackfill: "triggered" | "skipped" | "no_pdf";
      n8nWebhook: "fired" | "skipped";
    }[] = [];

    for (const entry of entries) {
      const projectName = entry["Project Name"];
      const folderName = entry["Folder Name"];
      const folderId = entry["Google Drive Folder ID"];
      const pdfFilename = entry["Report PDF"];

      // Check if project already exists
      const { data: existing } = await supabase
        .from("projects")
        .select("id")
        .eq("name", projectName)
        .eq("is_reference", true)
        .maybeSingle();

      let projectId: string;
      let action: "created" | "existing";

      if (existing && !force) {
        projectId = existing.id as string;
        action = "existing";
      } else if (existing && force) {
        projectId = existing.id as string;
        action = "existing";
        // Delete existing report_sections for this project so we can re-backfill
        await supabase
          .from("report_sections")
          .delete()
          .eq("project_id", projectId);
      } else {
        const { data: newProject, error: projectErr } = await supabase
          .from("projects")
          .insert({
            name: projectName,
            project_folder_id: folderId,
            is_reference: true,
            subject: { folderName },
          })
          .select("id")
          .single();

        if (projectErr ?? !newProject) {
          results.push({
            projectName,
            project_id: "",
            action: "created",
            pdfBackfill: "skipped",
            n8nWebhook: "skipped",
          });
          console.error(`Failed to create project ${projectName}:`, projectErr);
          continue;
        }

        projectId = newProject.id as string;
        action = "created";
      }

      // ------------------------------------------------------------------
      // Call backfill endpoint for this project's PDF
      // ------------------------------------------------------------------
      const pdfPath = path.join(pastReportsDir, pdfFilename);
      let pdfBackfill: "triggered" | "skipped" | "no_pdf";

      if (fs.existsSync(pdfPath)) {
        try {
          const backfillRes = await fetch(
            `${baseUrl}/api/seed/backfill-reports`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                project_id: projectId,
                pdf_filename: pdfFilename,
              }),
            },
          );
          pdfBackfill = backfillRes.ok ? "triggered" : "skipped";
        } catch {
          pdfBackfill = "skipped";
        }
      } else {
        pdfBackfill = "no_pdf";
      }

      // ------------------------------------------------------------------
      // Fire n8n webhook (fire-and-forget)
      // ------------------------------------------------------------------
      let n8nWebhook: "fired" | "skipped" = "skipped";
      if (n8nWebhookBase) {
        try {
          void fetch(`${n8nWebhookBase}/past-report-photo-backfil`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_folder_id: folderId,
              project_id: projectId,
            }),
          });
          n8nWebhook = "fired";
        } catch {
          n8nWebhook = "skipped";
        }
      }

      results.push({
        projectName,
        project_id: projectId,
        action,
        pdfBackfill,
        n8nWebhook,
      });
    }

    return NextResponse.json({
      message: `Processed ${results.length} reference projects`,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to import old reports",
      },
      { status: 500 },
    );
  }
}
