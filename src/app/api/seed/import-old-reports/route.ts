import "server-only";
import { NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { createClient, createServiceClient } from "~/utils/supabase/server";

const TAG = "[import-old-reports]";

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

  const jsonMatch = /```json\s*([\s\S]*?)```/.exec(content);
  if (!jsonMatch?.[1]) {
    throw new Error("Could not find JSON block in project-folder-ids.md");
  }

  return JSON.parse(jsonMatch[1]) as ProjectFolderEntry[];
}

export async function POST(request: Request) {
  const t0 = Date.now();
  try {
    let body: { force?: boolean; execute_once?: boolean } = {};
    try {
      const text = await request.text();
      if (text.trim()) {
        body = JSON.parse(text) as typeof body;
      }
    } catch {
      // empty body is fine
    }

    const force = body.force === true;
    const executeOnce = body.execute_once === true;

    console.log(TAG, "Starting import", { force, executeOnce });

    const supabase =
      process.env.NODE_ENV === "development"
        ? createServiceClient()
        : await createClient();

    console.log(
      TAG,
      `Using ${process.env.NODE_ENV === "development" ? "service-role" : "cookie-based"} Supabase client`,
    );

    const entries = parseProjectFolderIds();
    const entriesToProcess = executeOnce ? entries.slice(0, 1) : entries;
    console.log(
      TAG,
      `Parsed ${entries.length} entries from project-folder-ids.md, processing ${entriesToProcess.length}`,
    );

    const pastReportsDir = path.join(process.cwd(), "docs", "past-reports");

    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000");

    const n8nWebhookBase = process.env.N8N_WEBHOOK_BASE_URL ?? "";
    console.log(TAG, `Base URL: ${baseUrl}`);
    console.log(
      TAG,
      `n8n webhook base: ${n8nWebhookBase || "(not configured)"}`,
    );

    const results: {
      projectName: string;
      project_id: string;
      action: "created" | "existing";
      pdfBackfill: "triggered" | "skipped" | "no_pdf";
      pdfBackfillDetail?: string;
      n8nWebhook: "fired" | "skipped";
    }[] = [];

    for (let i = 0; i < entriesToProcess.length; i++) {
      const entry = entriesToProcess[i]!;
      const projectName = entry["Project Name"];
      const folderId = entry["Google Drive Folder ID"];
      const pdfFilename = entry["Report PDF"];

      console.log(
        TAG,
        `\n--- [${i + 1}/${entriesToProcess.length}] ${projectName} ---`,
      );

      // Check if project already exists
      const { data: existing, error: lookupErr } = await supabase
        .from("projects")
        .select("id")
        .eq("name", projectName)
        .eq("is_reference", true)
        .maybeSingle();

      if (lookupErr) {
        console.error(TAG, `  DB lookup failed:`, lookupErr.message);
      }

      let projectId: string;
      let action: "created" | "existing";

      if (existing && !force) {
        projectId = existing.id as string;
        action = "existing";
        console.log(TAG, `  Found existing project: ${projectId}`);
      } else if (existing && force) {
        projectId = existing.id as string;
        action = "existing";
        console.log(
          TAG,
          `  Found existing project (force=true), clearing report_sections: ${projectId}`,
        );
        const { count } = await supabase
          .from("report_sections")
          .delete()
          .eq("project_id", projectId)
          .select("id", { count: "exact", head: true });
        console.log(TAG, `  Deleted ${count ?? 0} existing report_sections`);
      } else {
        console.log(TAG, `  Creating new project...`);
        const { data: newProject, error: projectErr } = await supabase
          .from("projects")
          .insert({
            name: projectName,
            project_folder_id: folderId,
            is_reference: true,
          })
          .select("id")
          .single();

        if (projectErr ?? !newProject) {
          console.error(
            TAG,
            `  FAILED to create project:`,
            projectErr?.message,
          );
          results.push({
            projectName,
            project_id: "",
            action: "created",
            pdfBackfill: "skipped",
            n8nWebhook: "skipped",
          });
          continue;
        }

        projectId = newProject.id as string;
        action = "created";
        console.log(TAG, `  Created project: ${projectId}`);
      }

      // ------------------------------------------------------------------
      // Call backfill endpoint for this project's PDF
      // ------------------------------------------------------------------
      const pdfPath = path.join(pastReportsDir, pdfFilename);
      let pdfBackfill: "triggered" | "skipped" | "no_pdf";
      let pdfBackfillDetail: string | undefined;

      if (fs.existsSync(pdfPath)) {
        const backfillUrl = `${baseUrl}/api/seed/backfill-reports`;
        const backfillBody = {
          project_id: projectId,
          pdf_filename: pdfFilename,
        };
        console.log(
          TAG,
          `  Calling backfill: POST ${backfillUrl}`,
          backfillBody,
        );

        try {
          const backfillT0 = Date.now();
          const backfillRes = await fetch(backfillUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(backfillBody),
          });

          const backfillJson = (await backfillRes.json()) as Record<
            string,
            unknown
          >;
          const elapsed = Date.now() - backfillT0;

          if (backfillRes.ok) {
            pdfBackfill = "triggered";
            pdfBackfillDetail = JSON.stringify(backfillJson);
            console.log(
              TAG,
              `  Backfill OK (${elapsed}ms):`,
              JSON.stringify(backfillJson, null, 2),
            );
          } else {
            pdfBackfill = "skipped";
            pdfBackfillDetail = `HTTP ${backfillRes.status}: ${JSON.stringify(backfillJson)}`;
            console.error(
              TAG,
              `  Backfill FAILED (${elapsed}ms): HTTP ${backfillRes.status}`,
              backfillJson,
            );
          }
        } catch (err) {
          pdfBackfill = "skipped";
          pdfBackfillDetail =
            err instanceof Error ? err.message : "fetch error";
          console.error(TAG, `  Backfill EXCEPTION:`, pdfBackfillDetail);
        }
      } else {
        pdfBackfill = "no_pdf";
        console.warn(TAG, `  PDF not found on disk: ${pdfFilename}`);
      }

      // ------------------------------------------------------------------
      // Fire n8n webhook (fire-and-forget)
      // ------------------------------------------------------------------
      let n8nWebhook: "fired" | "skipped" = "skipped";
      if (n8nWebhookBase) {
        const webhookUrl = `${n8nWebhookBase}/past-report-photo-backfill`;
        const webhookBody = {
          project_folder_id: folderId,
          project_id: projectId,
        };
        console.log(TAG, `  Firing n8n webhook: POST ${webhookUrl}`);
        try {
          void fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(webhookBody),
          });
          n8nWebhook = "fired";
        } catch {
          console.error(TAG, `  n8n webhook failed`);
          n8nWebhook = "skipped";
        }
      } else {
        console.log(TAG, `  Skipping n8n webhook (no N8N_WEBHOOK_BASE_URL)`);
      }

      const result = {
        projectName,
        project_id: projectId,
        action,
        pdfBackfill,
        pdfBackfillDetail,
        n8nWebhook,
      };
      results.push(result);
      console.log(TAG, `  Result:`, JSON.stringify(result));
    }

    const elapsed = Date.now() - t0;
    console.log(
      TAG,
      `\nDone — processed ${results.length} projects in ${elapsed}ms`,
    );

    return NextResponse.json({
      message: `Processed ${results.length}/${entries.length} reference projects${executeOnce ? " (execute_once)" : ""}`,
      elapsed_ms: elapsed,
      results,
    });
  } catch (error) {
    const elapsed = Date.now() - t0;
    console.error(
      TAG,
      `FATAL ERROR after ${elapsed}ms:`,
      error instanceof Error ? error.message : error,
    );
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
