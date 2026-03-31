"use client";

import { useRouter } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import {
  createDefaultProject,
  normalizeProjectData,
} from "~/utils/projectStore";
import { useProjectsList, type DriveProject } from "~/hooks/useProjectsList";
import { insertProject } from "~/lib/supabase-queries";
import type { FolderStructure } from "~/lib/project-discovery";
import type { EngagementData } from "~/lib/engagement-parser";
import { ProfileMenu } from "~/components/ProfileMenu";
import { useAuth } from "~/hooks/useAuth";

type WizardStep =
  | "select-folder"
  | "discovering"
  | "engagement"
  | "subject-docs"
  | "flood-map"
  | "confirm";

interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
}

export default function NewProjectPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const {
    projects: availableProjects,
    isLoading: isLoadingList,
    error: listError,
  } = useProjectsList();

  const [driveHealth, setDriveHealth] = useState<
    "checking" | "ok" | "issue"
  >("checking");
  const [driveHealthMessage, setDriveHealthMessage] = useState<string | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/drive-status");
        const data = (await res.json()) as {
          authenticated?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (data.authenticated) {
          setDriveHealth("ok");
          setDriveHealthMessage(null);
        } else {
          setDriveHealth("issue");
          setDriveHealthMessage(
            data.error ?? "Google Drive is not connected for this session.",
          );
        }
      } catch {
        if (!cancelled) {
          setDriveHealth("issue");
          setDriveHealthMessage(
            "Could not verify Google Drive access. Check your connection and try again.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [step, setStep] = useState<WizardStep>("select-folder");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProject, setSelectedProject] = useState<DriveProject | null>(null);
  const [projectName, setProjectName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [folderStructure, setFolderStructure] = useState<FolderStructure>({});
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null);
  const [spreadsheetCandidates, setSpreadsheetCandidates] = useState<DriveFileItem[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);

  const [engagementFiles, setEngagementFiles] = useState<DriveFileItem[]>([]);
  const [engagementData, setEngagementData] = useState<EngagementData | null>(null);
  const [selectedEngagementFileIds, setSelectedEngagementFileIds] = useState<Set<string>>(new Set());
  const [isParsingEngagement, setIsParsingEngagement] = useState(false);

  const [subjectFiles, setSubjectFiles] = useState<DriveFileItem[]>([]);
  const [sketchFiles, setSketchFiles] = useState<DriveFileItem[]>([]);
  const [selectedSubjectFileIds, setSelectedSubjectFileIds] = useState<Set<string>>(new Set());
  const [selectedSketchFileIds, setSelectedSketchFileIds] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [floodMapFile, setFloodMapFile] = useState<DriveFileItem | null>(null);
  const [isParsingFlood, setIsParsingFlood] = useState(false);
  const [floodData, setFloodData] = useState<Record<string, string> | null>(null);

  const filteredProjects = availableProjects.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleSelectFolder = useCallback(
    async (project: DriveProject) => {
      setSelectedProject(project);
      setProjectName(project.name);
      setError(null);
      setStep("discovering");

      try {
        const defaultProject = normalizeProjectData(createDefaultProject());
        const newId = await insertProject(project.name, {
          ...defaultProject,
          projectFolderId: project.id,
        });
        setProjectId(newId);

        const discoverRes = await fetch("/api/projects/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: newId,
            projectFolderId: project.id,
          }),
        });

        if (!discoverRes.ok) {
          const err = (await discoverRes.json()) as { error?: string };
          throw new Error(err.error ?? "Discovery failed");
        }

        const discoverData = (await discoverRes.json()) as {
          folderStructure: FolderStructure;
          spreadsheetId: string | null;
          spreadsheetCandidates: DriveFileItem[];
        };

        setFolderStructure(discoverData.folderStructure);
        setSpreadsheetId(discoverData.spreadsheetId);
        setSpreadsheetCandidates(discoverData.spreadsheetCandidates ?? []);

        if (discoverData.folderStructure.engagementFolderId) {
          const listRes = await fetch("/api/drive/list", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              folderId: discoverData.folderStructure.engagementFolderId,
              filesOnly: true,
            }),
          });
          if (listRes.ok) {
            const listData = (await listRes.json()) as { files: DriveFileItem[] };
            setEngagementFiles(listData.files);
          } else {
            const errBody = (await listRes.json()) as { error?: string };
            setDriveHealth("issue");
            setDriveHealthMessage(
              errBody.error ?? "Could not load engagement folder from Drive.",
            );
          }
        }

        if (discoverData.folderStructure.subjectFolderId) {
          const listRes = await fetch("/api/drive/list", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              folderId: discoverData.folderStructure.subjectFolderId,
              filesOnly: true,
            }),
          });
          if (listRes.ok) {
            const listData = (await listRes.json()) as { files: DriveFileItem[] };
            setSubjectFiles(listData.files);
          } else {
            const errBody = (await listRes.json()) as { error?: string };
            setDriveHealth("issue");
            setDriveHealthMessage(
              errBody.error ?? "Could not load subject folder from Drive.",
            );
          }
        }

        if (discoverData.folderStructure.subjectSketchesFolderId) {
          const listRes = await fetch("/api/drive/list", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              folderId: discoverData.folderStructure.subjectSketchesFolderId,
              filesOnly: true,
            }),
          });
          if (listRes.ok) {
            const listData = (await listRes.json()) as { files: DriveFileItem[] };
            setSketchFiles(listData.files);
          }
        }

        if (discoverData.folderStructure.reportMapsFolderId) {
          const listRes = await fetch("/api/drive/list", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              folderId: discoverData.folderStructure.reportMapsFolderId,
              filesOnly: true,
            }),
          });
          if (listRes.ok) {
            const listData = (await listRes.json()) as { files: DriveFileItem[] };
            const floodFile = listData.files.find((f) =>
              f.name.toLowerCase().includes("flood"),
            );
            if (floodFile) setFloodMapFile(floodFile);
          }
        }

        setStep("engagement");
      } catch (err) {
        console.error("Discovery error:", err);
        setError(err instanceof Error ? err.message : "Discovery failed");
        setStep("select-folder");
      } finally {
        // Step-based UI handles the loading state
      }
    },
    [],
  );

  const handleParseEngagement = useCallback(async () => {
    if (selectedEngagementFileIds.size === 0) return;
    setIsParsingEngagement(true);
    setError(null);

    try {
      let merged: EngagementData = {
        clientName: "",
        clientCompanyName: "",
        propertyAddress: "",
        propertyType: "",
        effectiveDate: "",
        reportDueDate: "",
        scopeOfWork: "",
        additionalNotes: "",
      };

      for (const fileId of selectedEngagementFileIds) {
        const res = await fetch("/api/projects/parse-engagement", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId }),
        });

        if (!res.ok) {
          const err = (await res.json()) as { error?: string };
          if (res.status === 401) {
            setDriveHealth("issue");
            setDriveHealthMessage(
              err.error ?? "Google Drive access expired — sign in again.",
            );
          }
          throw new Error(err.error ?? "Parse failed");
        }

        const result = (await res.json()) as { data: EngagementData };
        merged = mergeEngagementData(merged, result.data);
      }

      setEngagementData(merged);
    } catch (err) {
      console.error("Engagement parse error:", err);
      setError(err instanceof Error ? err.message : "Failed to parse engagement document");
    } finally {
      setIsParsingEngagement(false);
    }
  }, [selectedEngagementFileIds]);

  const handleSkipEngagement = useCallback(() => {
    setStep("subject-docs");
  }, []);

  const handleConfirmEngagement = useCallback(() => {
    setStep("subject-docs");
  }, []);

  const toggleEngagementFile = useCallback((fileId: string) => {
    setSelectedEngagementFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const toggleSubjectFile = useCallback((fileId: string) => {
    setSelectedSubjectFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const toggleSketchFile = useCallback((fileId: string) => {
    setSelectedSketchFileIds((prev) => {
      const next = new Set(prev);
      if (next.has(fileId)) next.delete(fileId);
      else next.add(fileId);
      return next;
    });
  }, []);

  const handleParseFloodMap = useCallback(async () => {
    if (!floodMapFile) return;
    setIsParsingFlood(true);
    setError(null);

    try {
      const res = await fetch("/api/projects/parse-flood-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: floodMapFile.id }),
      });

      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        if (res.status === 401) {
          setDriveHealth("issue");
          setDriveHealthMessage(
            err.error ?? "Google Drive access expired — sign in again.",
          );
        }
        throw new Error(err.error ?? "Failed to parse flood map");
      }

      const result = (await res.json()) as { data: Record<string, string> };
      setFloodData(result.data);
    } catch (err) {
      console.error("Flood map parse error:", err);
      setError(err instanceof Error ? err.message : "Failed to parse flood map");
    } finally {
      setIsParsingFlood(false);
    }
  }, [floodMapFile]);

  const handleFinalize = useCallback(async () => {
    if (!projectId) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const { createClient } = await import("~/utils/supabase/client");
      const supabase = createClient();

      const address = engagementData?.propertyAddress ?? "";

      const clientUpdates: Record<string, unknown> = {};
      if (engagementData?.clientName) clientUpdates.client_name = engagementData.clientName;
      if (engagementData?.clientCompanyName) clientUpdates.client_company = engagementData.clientCompanyName;
      if (engagementData?.propertyType) clientUpdates.property_type = engagementData.propertyType;
      if (engagementData?.effectiveDate) clientUpdates.effective_date = engagementData.effectiveDate;
      if (engagementData?.reportDueDate) clientUpdates.report_due_date = engagementData.reportDueDate;

      if (Object.keys(clientUpdates).length > 0) {
        const { error: updateError } = await supabase
          .from("projects")
          .update(clientUpdates)
          .eq("id", projectId);

        if (updateError) {
          console.error("Failed to update project with engagement data:", updateError);
        }
      }

      // Seed subject_data so Subject Overview starts populated.
      // FEMA data goes into its own `fema` column to avoid collisions with core.
      const subjectCore: Record<string, unknown> = { Address: address };
      const addressParts = parseAddressParts(address);
      if (addressParts.city) subjectCore.City = addressParts.city;
      if (addressParts.state) subjectCore.State = addressParts.state;
      if (addressParts.zip) subjectCore.Zip = addressParts.zip;

      const femaPayload: Record<string, unknown> = {};
      if (floodData) {
        if (floodData.fema_map_number) femaPayload.FemaMapNum = floodData.fema_map_number;
        if (floodData.flood_zone) femaPayload.FemaZone = floodData.flood_zone;
        if (floodData.map_effective_date) femaPayload.FemaMapDate = floodData.map_effective_date;
        if (floodData.in_special_flood_hazard_area === "true") femaPayload.FemaIsHazardZone = true;
        else if (floodData.in_special_flood_hazard_area === "false") femaPayload.FemaIsHazardZone = false;
      }

      await supabase
        .from("subject_data")
        .upsert(
          {
            project_id: projectId,
            core: subjectCore,
            fema: femaPayload,
            taxes: [],
            tax_entities: [],
            parcels: [],
            improvements: [],
          },
          { onConflict: "project_id" },
        );

      if (selectedSubjectFileIds.size > 0) {
        for (const fileId of selectedSubjectFileIds) {
          const file = subjectFiles.find((f) => f.id === fileId);
          if (!file) continue;

          const docType = inferDocumentType(file.name, file.mimeType);
          await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId,
              documentType: docType,
              documentLabel: file.name,
              fileId: file.id,
              fileName: file.name,
              mimeType: file.mimeType,
              sectionTag: "subject",
            }),
          });
        }
      }

      if (selectedSketchFileIds.size > 0) {
        for (const fileId of selectedSketchFileIds) {
          const file = sketchFiles.find((f) => f.id === fileId);
          if (!file) continue;

          await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId,
              documentType: "sketch",
              documentLabel: file.name,
              fileId: file.id,
              fileName: file.name,
              mimeType: file.mimeType,
              sectionTag: "subject",
            }),
          });
        }
      }

      if (floodMapFile) {
        await fetch("/api/documents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            documentType: "flood_map",
            documentLabel: floodMapFile.name,
            fileId: floodMapFile.id,
            fileName: floodMapFile.name,
            mimeType: floodMapFile.mimeType,
            sectionTag: "subject",
          }),
        });
      }

      router.push(`/project/${projectId}`);
    } catch (err) {
      console.error("Finalization error:", err);
      setError(err instanceof Error ? err.message : "Failed to finalize project");
    } finally {
      setIsSubmitting(false);
    }
  }, [projectId, engagementData, selectedSubjectFileIds, subjectFiles, selectedSketchFileIds, sketchFiles, floodData, floodMapFile, router]);

  const activeStyle =
    "border-blue-500 bg-blue-600 text-white hover:bg-blue-700";
  const inactiveStyle =
    "border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700";

  return (
    <div className="flex min-h-screen flex-col bg-gray-950 px-4 py-8 sm:px-8">
      <div className="mx-auto w-full max-w-2xl flex-1">
        <header className="mb-6 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => router.push("/projects")}
            className="rounded-lg border border-gray-600 bg-gray-900 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-800"
          >
            Cancel
          </button>
          <ProfileMenu isCollapsed variant="header" />
        </header>

        {driveHealth === "issue" && driveHealthMessage && (
          <div
            className="mb-6 rounded-lg border border-amber-800/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-100"
            role="alert"
          >
            <p className="mb-3 text-amber-50/95">{driveHealthMessage}</p>
            <button
              type="button"
              onClick={() => void signIn("/projects/new")}
              className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-amber-500"
            >
              Re-authenticate with Google
            </button>
          </div>
        )}

        {/* Progress indicator */}
        <div className="mb-8 flex items-center justify-center gap-2">
          {(["select-folder", "discovering", "engagement", "subject-docs", "flood-map", "confirm"] as WizardStep[]).map(
            (s, i) => {
              const allSteps: WizardStep[] = ["select-folder", "discovering", "engagement", "subject-docs", "flood-map", "confirm"];
              return (
                <div key={s} className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      step === s
                        ? "bg-blue-600 text-white"
                        : allSteps.indexOf(s) < allSteps.indexOf(step)
                          ? "bg-blue-900/50 text-blue-300"
                          : "bg-gray-800 text-gray-500"
                    }`}
                  >
                    {i + 1}
                  </div>
                  {i < allSteps.length - 1 && (
                    <div className="h-px w-6 bg-gray-700" />
                  )}
                </div>
              );
            },
          )}
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900 p-8 shadow-2xl">
          {/* Step 1: Select folder */}
          {step === "select-folder" && (
            <>
              <h1 className="mb-2 text-2xl font-bold tracking-tight text-gray-100">
                New Project
              </h1>
              <p className="mb-6 text-sm text-gray-400">
                Select a Google Drive folder to begin project setup.
              </p>

              <input
                type="text"
                placeholder="Search project folders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="mb-4 w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />

              <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-700">
                {isLoadingList ? (
                  <div className="p-6 text-center text-sm text-gray-400">
                    <div className="mb-2 inline-block h-5 w-5 animate-spin rounded-full border-2 border-gray-600 border-t-blue-500" />
                    <p>Loading available folders...</p>
                  </div>
                ) : listError ? (
                  <div className="p-6 text-center text-sm text-red-400">
                    {listError}
                  </div>
                ) : filteredProjects.length === 0 ? (
                  <div className="p-6 text-center text-sm text-gray-500">
                    No project folders found
                  </div>
                ) : (
                  <div className="divide-y divide-gray-800">
                    {filteredProjects.map((project) => (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => void handleSelectFolder(project)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-200 transition hover:bg-gray-800"
                      >
                        <span className="text-gray-500">📁</span>
                        <span>{project.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

            </>
          )}

          {/* Step 2: Discovering */}
          {step === "discovering" && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-gray-700 border-t-blue-500" />
              <h2 className="mb-2 text-lg font-semibold text-gray-100">
                Discovering Project Structure
              </h2>
              <p className="text-sm text-gray-400">
                Scanning <span className="font-medium text-gray-300">{selectedProject?.name}</span> folder...
              </p>
            </div>
          )}

          {/* Step 3: Engagement document */}
          {step === "engagement" && (
            <>
              <h2 className="mb-2 text-xl font-bold text-gray-100">
                Engagement Document
              </h2>
              <p className="mb-6 text-sm text-gray-400">
                Select an engagement letter to extract client and property details, or skip this step.
              </p>

              {/* Discovery summary */}
              <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800/50 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Discovered Structure
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                  <span>Subject folder: {folderStructure.subjectFolderId ? "Found" : "—"}</span>
                  <span>Photos folder: {folderStructure.subjectPhotosFolderId ? "Found" : "—"}</span>
                  <span>Reports folder: {folderStructure.reportsFolderId ? "Found" : "—"}</span>
                  <span>Maps folder: {folderStructure.reportMapsFolderId ? "Found" : "—"}</span>
                  <span>Comps folders: {folderStructure.compsFolderIds ? "Found" : "—"}</span>
                  <span>Spreadsheet: {spreadsheetId ? "Found" : spreadsheetCandidates.length > 1 ? "Select below \u2193" : "\u2014"}</span>
                </div>
              </div>

              {spreadsheetCandidates.length > 1 && !spreadsheetId && (
                <div className="mb-6 rounded-lg border border-amber-800/60 bg-amber-950/30 p-4">
                  <h3 className="mb-1 text-sm font-semibold text-amber-100">
                    Multiple spreadsheets found
                  </h3>
                  <p className="mb-3 text-xs text-amber-200/70">
                    Select the report-data spreadsheet for this project.
                  </p>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-700">
                    {spreadsheetCandidates.map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={async () => {
                          setSpreadsheetId(f.id);
                          if (projectId) {
                            await fetch("/api/projects/select-spreadsheet", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ projectId, spreadsheetId: f.id }),
                            });
                          }
                        }}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-gray-200 transition hover:bg-gray-800"
                      >
                        <span className="text-green-500">📊</span>
                        <span className="truncate">{f.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {engagementFiles.length > 0 && !engagementData && (
                <div className="mb-4">
                  <label className="mb-2 block text-xs font-medium text-gray-400">
                    Select engagement document
                  </label>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-700">
                    {engagementFiles.map((f) => {
                      const isSelected = selectedEngagementFileIds.has(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => toggleEngagementFile(f.id)}
                          className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition ${
                            isSelected
                              ? "bg-blue-900/20 text-blue-300"
                              : "text-gray-300 hover:bg-gray-800"
                          }`}
                        >
                          <div
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                              isSelected
                                ? "border-blue-500 bg-blue-600"
                                : "border-gray-600 bg-gray-800"
                            }`}
                          >
                            {isSelected && (
                              <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span className="text-gray-500">📄</span>
                          {f.name}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleParseEngagement()}
                    disabled={selectedEngagementFileIds.size === 0 || isParsingEngagement}
                    className={`mt-3 w-full rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                      selectedEngagementFileIds.size > 0 && !isParsingEngagement ? activeStyle : "border-gray-700 bg-gray-800 text-gray-500"
                    } disabled:opacity-50`}
                  >
                    {isParsingEngagement
                      ? "Parsing..."
                      : selectedEngagementFileIds.size > 1
                        ? `Parse ${selectedEngagementFileIds.size} Documents`
                        : "Parse Document"}
                  </button>
                </div>
              )}

              {engagementFiles.length === 0 && (
                <p className="mb-4 text-sm text-gray-500">
                  No engagement documents folder found. You can add client details later.
                </p>
              )}

              {engagementData && (
                <div className="mb-4 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-200">
                    Extracted Details — Confirm or Edit
                  </h3>
                  {(
                    [
                      ["Client Name", "clientName"],
                      ["Company", "clientCompanyName"],
                      ["Property Address", "propertyAddress"],
                      ["Property Type", "propertyType"],
                    ] as [string, keyof EngagementData][]
                  ).map(([label, key]) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs text-gray-500">
                        {label}
                      </label>
                      <input
                        type="text"
                        value={engagementData[key]}
                        onChange={(e) =>
                          setEngagementData((prev) =>
                            prev ? { ...prev, [key]: e.target.value } : prev,
                          )
                        }
                        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  ))}
                  {(
                    [
                      ["Effective Date", "effectiveDate"],
                      ["Due Date", "reportDueDate"],
                    ] as [string, "effectiveDate" | "reportDueDate"][]
                  ).map(([label, key]) => (
                    <div key={key}>
                      <label className="mb-1 block text-xs text-gray-500">
                        {label}
                      </label>
                      <input
                        type="date"
                        value={toDateInputValue(engagementData[key])}
                        onChange={(e) =>
                          setEngagementData((prev) =>
                            prev
                              ? { ...prev, [key]: fromDateInputValue(e.target.value) }
                              : prev,
                          )
                        }
                        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 [color-scheme:dark] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={handleSkipEngagement}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${inactiveStyle}`}
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={handleConfirmEngagement}
                  disabled={!engagementData && engagementFiles.length > 0}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${activeStyle} disabled:opacity-50`}
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {/* Step 4: Subject documents */}
          {step === "subject-docs" && (
            <>
              <h2 className="mb-2 text-xl font-bold text-gray-100">
                Subject Documents
              </h2>
              <p className="mb-6 text-sm text-gray-400">
                Select documents from the subject folder to process for initial context. You can add more later.
              </p>

              {subjectFiles.length > 0 ? (
                <div className="max-h-60 overflow-y-auto rounded-lg border border-gray-700">
                  {subjectFiles.map((f) => {
                    const isSelected = selectedSubjectFileIds.has(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleSubjectFile(f.id)}
                        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition ${
                          isSelected
                            ? "bg-blue-900/20 text-blue-300"
                            : "text-gray-300 hover:bg-gray-800"
                        }`}
                      >
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
                            isSelected
                              ? "border-blue-500 bg-blue-600"
                              : "border-gray-600 bg-gray-800"
                          }`}
                        >
                          {isSelected && (
                            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <span className="text-gray-500">📄</span>
                        <span>{f.name}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-gray-500">
                  No subject folder found. You can upload documents later.
                </p>
              )}

              {sketchFiles.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-2 text-sm font-semibold text-gray-300">
                    Building Sketches
                  </h3>
                  <p className="mb-3 text-xs text-gray-500">
                    Select sketch files to extract building dimensions and area calculations.
                  </p>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-700">
                    {sketchFiles.map((f) => {
                      const isSelected = selectedSketchFileIds.has(f.id);
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => toggleSketchFile(f.id)}
                          className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition ${
                            isSelected
                              ? "bg-blue-900/20 text-blue-300"
                              : "text-gray-300 hover:bg-gray-800"
                          }`}
                        >
                          <div
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
                              isSelected
                                ? "border-blue-500 bg-blue-600"
                                : "border-gray-600 bg-gray-800"
                            }`}
                          >
                            {isSelected && (
                              <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          <span className="text-gray-500">📐</span>
                          <span>{f.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep("engagement")}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${inactiveStyle}`}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep("flood-map")}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${activeStyle}`}
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {/* Step 5: Flood Map */}
          {step === "flood-map" && (
            <>
              <h2 className="mb-2 text-xl font-bold text-gray-100">
                FEMA Flood Map
              </h2>
              <p className="mb-6 text-sm text-gray-400">
                {floodMapFile
                  ? "A flood map was found in the reports/maps folder. Parse it to extract FEMA data, or skip this step."
                  : "No flood map found in the reports/maps folder. You can add one later."}
              </p>

              {floodMapFile && !floodData && (
                <div className="mb-4">
                  <div className="mb-3 flex items-center gap-3 rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3">
                    <span className="text-gray-500">📄</span>
                    <span className="text-sm text-gray-200">{floodMapFile.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleParseFloodMap()}
                    disabled={isParsingFlood}
                    className={`w-full rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                      !isParsingFlood ? activeStyle : "border-gray-700 bg-gray-800 text-gray-500"
                    } disabled:opacity-50`}
                  >
                    {isParsingFlood ? "Analyzing flood map..." : "Parse Flood Map"}
                  </button>
                </div>
              )}

              {floodData && (
                <div className="mb-4 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-200">
                    Extracted FEMA Data — Confirm or Edit
                  </h3>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">FEMA Map Number</label>
                    <input
                      type="text"
                      value={floodData.fema_map_number ?? ""}
                      onChange={(e) => setFloodData((prev) => prev ? { ...prev, fema_map_number: e.target.value } : prev)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Flood Zone</label>
                    <input
                      type="text"
                      value={floodData.flood_zone ?? ""}
                      onChange={(e) => setFloodData((prev) => prev ? { ...prev, flood_zone: e.target.value } : prev)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Special Flood Hazard Area</label>
                    <select
                      value={floodData.in_special_flood_hazard_area ?? ""}
                      onChange={(e) => setFloodData((prev) => prev ? { ...prev, in_special_flood_hazard_area: e.target.value } : prev)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 [color-scheme:dark] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    >
                      <option value="">Unknown</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Map Effective Date</label>
                    <input
                      type="text"
                      value={floodData.map_effective_date ?? ""}
                      onChange={(e) => setFloodData((prev) => prev ? { ...prev, map_effective_date: e.target.value } : prev)}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep("subject-docs")}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${inactiveStyle}`}
                >
                  Back
                </button>
                <div className="flex gap-2">
                  {floodMapFile && !floodData && (
                    <button
                      type="button"
                      onClick={() => setStep("confirm")}
                      className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${inactiveStyle}`}
                    >
                      Skip
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setStep("confirm")}
                    className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${activeStyle}`}
                  >
                    Continue
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Step 6: Confirmation */}
          {step === "confirm" && (
            <>
              <h2 className="mb-2 text-xl font-bold text-gray-100">
                Confirm Project Setup
              </h2>
              <p className="mb-6 text-sm text-gray-400">
                Review the project details and finalize setup.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Project Name</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                {engagementData && (
                  <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Client Info
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm text-gray-300">
                      <span>{engagementData.clientName}</span>
                      <span>{engagementData.clientCompanyName}</span>
                      <span className="col-span-2">{engagementData.propertyAddress}</span>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Folder Structure
                  </h3>
                  <div className="space-y-1 text-xs">
                    {(
                      [
                        ["Subject", folderStructure.subjectFolderId],
                        ["Photos", folderStructure.subjectPhotosFolderId],
                        ["Sketches", folderStructure.subjectSketchesFolderId],
                        ["Reports", folderStructure.reportsFolderId],
                        ["Maps", folderStructure.reportMapsFolderId],
                        ["Cost Report", folderStructure.costReportFolderId],
                        ["Engagement", folderStructure.engagementFolderId],
                        ["Land Comps", folderStructure.compsFolderIds?.land],
                        ["Sales Comps", folderStructure.compsFolderIds?.sales],
                        ["Rental Comps", folderStructure.compsFolderIds?.rentals],
                      ] as [string, string | undefined][]
                    )
                      .filter(([, id]) => id)
                      .map(([label, id]) => (
                        <div key={label} className="flex items-center justify-between gap-2">
                          <span className="text-gray-400">{label}</span>
                          <code className="truncate font-mono text-gray-500" title={id}>
                            {id!.length > 16 ? `${id!.slice(0, 16)}...` : id}
                          </code>
                        </div>
                      ))}
                  </div>
                  {spreadsheetId && (
                    <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-700 pt-2 text-xs">
                      <span className="text-gray-400">Spreadsheet</span>
                      <code className="truncate font-mono text-gray-500" title={spreadsheetId}>
                        {spreadsheetId.length > 16
                          ? `${spreadsheetId.slice(0, 16)}...`
                          : spreadsheetId}
                      </code>
                    </div>
                  )}
                </div>

                {selectedSubjectFileIds.size > 0 && (
                  <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-4">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Documents to Process ({selectedSubjectFileIds.size})
                    </h3>
                    <ul className="space-y-1 text-xs text-gray-400">
                      {[...selectedSubjectFileIds].map((id) => {
                        const file = subjectFiles.find((f) => f.id === id);
                        return <li key={id}>{file?.name ?? id}</li>;
                      })}
                    </ul>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep("flood-map")}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${inactiveStyle}`}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => void handleFinalize()}
                  disabled={isSubmitting}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${activeStyle} disabled:opacity-50`}
                >
                  {isSubmitting ? "Setting up..." : "Create Project"}
                </button>
              </div>
            </>
          )}

          {error && (
            <div className="mt-4 space-y-3 rounded-lg border border-red-900/50 bg-red-900/20 p-3 text-sm text-red-400">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void signIn("/projects/new")}
                className="rounded-lg border border-red-800/60 bg-red-950/50 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-950/80"
              >
                Re-authenticate with Google
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function mergeEngagementData(
  existing: EngagementData,
  incoming: EngagementData,
): EngagementData {
  const merged = { ...existing };
  for (const key of Object.keys(incoming) as (keyof EngagementData)[]) {
    if (!merged[key] && incoming[key]) {
      merged[key] = incoming[key];
    }
  }
  return merged;
}

function inferDocumentType(fileName: string, _mimeType: string): string {
  const lower = fileName.toLowerCase();
  if (lower.includes("deed")) return "deed";
  if (lower.includes("flood")) return "flood_map";
  if (lower.includes("cad") || lower.includes("appraisal district"))
    return "cad";
  if (lower.includes("zoning")) return "zoning_map";
  if (lower.includes("engagement") || lower.includes("proposal"))
    return "engagement";
  if (lower.includes("notes")) return "notes";
  if (lower.includes("sketch")) return "sketch";
  if (lower.includes("survey") || lower.includes("plat")) return "other";
  return "other";
}

/** Convert a stored MM/DD/YYYY string to the YYYY-MM-DD format required by <input type="date">. */
function toDateInputValue(value: string | undefined): string {
  if (!value) return "";
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  // MM/DD/YYYY → YYYY-MM-DD
  const mmddyyyy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (mmddyyyy) {
    const [, mm, dd, yyyy] = mmddyyyy;
    return `${yyyy}-${mm!.padStart(2, "0")}-${dd!.padStart(2, "0")}`;
  }
  // Attempt generic parse as a last resort
  const parsed = new Date(value);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return "";
}

/** Convert the YYYY-MM-DD value from <input type="date"> to MM/DD/YYYY for storage. */
function fromDateInputValue(value: string): string {
  if (!value) return "";
  const [yyyy, mm, dd] = value.split("-");
  if (!yyyy || !mm || !dd) return value;
  return `${mm}/${dd}/${yyyy}`;
}

/** Best-effort extraction of city, state, zip from a freeform US address string. */
function parseAddressParts(address: string): {
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
} {
  if (!address) return {};

  // Pattern 1: "..., City, ST ZIP" (standard)
  const p1 = /,\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i.exec(address);
  if (p1) {
    return { city: p1[1]?.trim(), state: p1[2]?.toUpperCase(), zip: p1[3] };
  }

  // Pattern 2: "... City, ST ZIP" (no comma before city, e.g. "331 Angel Trail Odessa, TX 79766")
  const p2 = /\s+(\w[\w\s]*?),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i.exec(address);
  if (p2) {
    return { city: p2[1]?.trim(), state: p2[2]?.toUpperCase(), zip: p2[3] };
  }

  // Pattern 3: "..., City, ST" without zip
  const p3 = /,\s*([^,]+),\s*([A-Z]{2})\s*$/i.exec(address);
  if (p3) {
    return { city: p3[1]?.trim(), state: p3[2]?.toUpperCase() };
  }

  // Pattern 4: "... City ST ZIP" (no commas at all)
  const p4 = /\s+(\w[\w\s]*?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i.exec(address);
  if (p4) {
    return { city: p4[1]?.trim(), state: p4[2]?.toUpperCase(), zip: p4[3] };
  }

  return {};
}
