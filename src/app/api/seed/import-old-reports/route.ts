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
      fileMode: "markdown" | "pdf" | "no_file";
      backfill: "triggered" | "skipped" | "no_file";
      backfillDetail?: string;
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
          `  Found existing project (force=true), clearing report_sections + extracted data: ${projectId}`,
        );
        const { error: delSectErr } = await supabase
          .from("report_sections")
          .delete()
          .eq("project_id", projectId);
        if (delSectErr) {
          console.warn(TAG, `  Failed to delete report_sections: ${delSectErr.message}`);
        }
        const { error: delExtErr } = await supabase
          .from("report_extracted_data")
          .delete()
          .eq("project_id", projectId);
        if (delExtErr) {
          console.warn(TAG, `  Failed to delete report_extracted_data: ${delExtErr.message}`);
        }
        const { error: delSubErr } = await supabase
          .from("subject_data")
          .delete()
          .eq("project_id", projectId);
        if (delSubErr) {
          console.warn(TAG, `  Failed to delete subject_data: ${delSubErr.message}`);
        }
        console.log(TAG, `  Cleared report_sections, report_extracted_data, subject_data for project ${projectId}`);
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
            fileMode: "no_file",
            backfill: "skipped",
            n8nWebhook: "skipped",
          });
          continue;
        }

        projectId = newProject.id as string;
        action = "created";
        console.log(TAG, `  Created project: ${projectId}`);
      }

      // ------------------------------------------------------------------
      // Call backfill endpoint — prefer .md over .pdf
      // ------------------------------------------------------------------
      const mdFilename = pdfFilename.replace(/\.pdf$/i, ".md");
      const mdPath = path.join(pastReportsDir, mdFilename);
      const pdfPath = path.join(pastReportsDir, pdfFilename);

      const useMd = fs.existsSync(mdPath);
      const usePdf = !useMd && fs.existsSync(pdfPath);

      if (useMd) {
        console.log(TAG, `  Using markdown: ${mdFilename} (preferred over PDF)`);
      } else if (usePdf) {
        console.log(TAG, `  Using PDF: ${pdfFilename} (no .md available)`);
      } else {
        console.warn(TAG, `  Neither .md nor .pdf found for ${pdfFilename}`);
      }

      let fileMode: "markdown" | "pdf" | "no_file";
      let backfill: "triggered" | "skipped" | "no_file";
      let backfillDetail: string | undefined;

      if (useMd || usePdf) {
        fileMode = useMd ? "markdown" : "pdf";
        const backfillUrl = `${baseUrl}/api/seed/backfill-reports`;
        const backfillBody = useMd
          ? { project_id: projectId, md_filename: mdFilename }
          : { project_id: projectId, pdf_filename: pdfFilename };

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
            backfill = "triggered";
            backfillDetail = JSON.stringify(backfillJson);
            console.log(
              TAG,
              `  Backfill OK (${elapsed}ms):`,
              JSON.stringify(backfillJson, null, 2),
            );
          } else {
            backfill = "skipped";
            backfillDetail = `HTTP ${backfillRes.status}: ${JSON.stringify(backfillJson)}`;
            console.error(
              TAG,
              `  Backfill FAILED (${elapsed}ms): HTTP ${backfillRes.status}`,
              backfillJson,
            );
          }
        } catch (err) {
          backfill = "skipped";
          backfillDetail =
            err instanceof Error ? err.message : "fetch error";
          console.error(TAG, `  Backfill EXCEPTION:`, backfillDetail);
        }
      } else {
        fileMode = "no_file";
        backfill = "no_file";
        console.warn(TAG, `  Skipping backfill — no file found for ${pdfFilename}`);
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
        fileMode,
        backfill,
        backfillDetail,
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
