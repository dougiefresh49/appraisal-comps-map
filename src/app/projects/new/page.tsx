"use client";

import { addDays, format, isValid, parse } from "date-fns";
import { useRouter } from "next/navigation";
import { useState, useCallback, useEffect, useRef } from "react";
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
import { createClient } from "~/utils/supabase/client";
import { parseEngagementDateToDate } from "~/utils/parse-engagement-date";

type WizardStep =
  | "select-folder"
  | "discovering"
  | "engagement"
  | "subject-docs"
  | "photos"
  | "flood-map"
  | "confirm";

interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
}

interface ProcessingTask {
  id: string;
  label: string;
  type: "project" | "doc" | "photos";
  status: "done" | "queued" | "background" | "stuck";
  isCritical: boolean;
}

const ALL_STEPS: WizardStep[] = [
  "select-folder",
  "discovering",
  "engagement",
  "subject-docs",
  "photos",
  "flood-map",
  "confirm",
];

const IMAGE_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "tif", "tiff",
]);

function isImageFile(name: string, mimeType?: string): boolean {
  if (mimeType?.startsWith("image/")) return true;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

export default function NewProjectPage() {
  const router = useRouter();
  const { signIn } = useAuth();
  const {
    projects: availableProjects,
    isLoading: isLoadingList,
    error: listError,
  } = useProjectsList();

  const [driveHealth, setDriveHealth] = useState<"checking" | "ok" | "issue">("checking");
  const [driveHealthMessage, setDriveHealthMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/auth/drive-status");
        const data = (await res.json()) as { authenticated?: boolean; error?: string };
        if (cancelled) return;
        if (data.authenticated) {
          setDriveHealth("ok");
          setDriveHealthMessage(null);
        } else {
          setDriveHealth("issue");
          setDriveHealthMessage(data.error ?? "Google Drive is not connected for this session.");
        }
      } catch {
        if (!cancelled) {
          setDriveHealth("issue");
          setDriveHealthMessage("Could not verify Google Drive access. Check your connection and try again.");
        }
      }
    })();
    return () => { cancelled = true; };
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

  const [photoFiles, setPhotoFiles] = useState<DriveFileItem[]>([]);
  const [autoImportPhotos, setAutoImportPhotos] = useState(true);

  const [floodMapFile, setFloodMapFile] = useState<DriveFileItem | null>(null);
  const [isParsingFlood, setIsParsingFlood] = useState(false);
  const [floodData, setFloodData] = useState<Record<string, string> | null>(null);

  // Processing status modal state
  const [showProcessingModal, setShowProcessingModal] = useState(false);
  const [processingTasks, setProcessingTasks] = useState<ProcessingTask[]>([]);
  const [photoAnalysisCount, setPhotoAnalysisCount] = useState(0);
  const [expectedPhotoCount, setExpectedPhotoCount] = useState(0);
  const photoChannelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const docChannelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);

  // Realtime subscriptions for processing modal
  useEffect(() => {
    if (!showProcessingModal || !projectId) return;

    const supabase = createClient();

    // Subscribe to document updates
    const docChannel = supabase
      .channel(`onboarding-docs:${projectId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "UPDATE",
          schema: "public",
          table: "project_documents",
          filter: `project_id=eq.${projectId}`,
        },
        (payload: { new: Record<string, unknown> }) => {
          const doc = payload.new as { id: string; processed_at: string | null };
          if (doc.processed_at) {
            setProcessingTasks((prev) =>
              prev.map((t) =>
                t.id === `doc-${doc.id}` ? { ...t, status: "done" } : t,
              ),
            );
          }
        },
      )
      .subscribe();

    docChannelRef.current = docChannel;

    // Subscribe to photo analysis inserts
    const photoChannel = supabase
      .channel(`onboarding-photos:${projectId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "INSERT",
          schema: "public",
          table: "photo_analyses",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          setPhotoAnalysisCount((prev) => prev + 1);
          setProcessingTasks((prev) =>
            prev.map((t) =>
              t.id === "photos" && t.status === "queued"
                ? { ...t, status: "background" }
                : t,
            ),
          );
        },
      )
      .subscribe();

    photoChannelRef.current = photoChannel;

    return () => {
      void docChannel.unsubscribe();
      void photoChannel.unsubscribe();
      docChannelRef.current = null;
      photoChannelRef.current = null;
    };
  }, [showProcessingModal, projectId]);

  // Auto-redirect when all critical tasks are done (or timed-out)
  useEffect(() => {
    if (!showProcessingModal || !projectId) return;
    const criticalTasks = processingTasks.filter((t) => t.isCritical);
    if (criticalTasks.length === 0) return;
    const allResolved = criticalTasks.every(
      (t) => t.status === "done" || t.status === "stuck",
    );
    if (allResolved) {
      const timer = setTimeout(() => {
        router.push(`/project/${projectId}`);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [showProcessingModal, processingTasks, projectId, router]);

  // Mark critical tasks as stuck after 60s so the modal doesn't hang forever
  useEffect(() => {
    if (!showProcessingModal) return;
    const hasQueued = processingTasks.some(
      (t) => t.isCritical && t.status === "queued",
    );
    if (!hasQueued) return;
    const timer = setTimeout(() => {
      setProcessingTasks((prev) =>
        prev.map((t) =>
          t.isCritical && t.status === "queued"
            ? { ...t, status: "stuck" }
            : t,
        ),
      );
    }, 60_000);
    return () => clearTimeout(timer);
  }, [showProcessingModal, processingTasks]);

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
          body: JSON.stringify({ projectId: newId, projectFolderId: project.id }),
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

        // Fetch all folder contents in parallel
        const fetchFolder = async (folderId: string): Promise<DriveFileItem[]> => {
          const res = await fetch("/api/drive/list", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderId, filesOnly: true }),
          });
          if (!res.ok) return [];
          const data = (await res.json()) as { files: DriveFileItem[] };
          return data.files;
        };

        const [
          fetchedEngagement,
          fetchedSubject,
          fetchedSketches,
          fetchedPhotos,
          fetchedMaps,
        ] = await Promise.all([
          discoverData.folderStructure.engagementFolderId
            ? fetchFolder(discoverData.folderStructure.engagementFolderId)
            : Promise.resolve([]),
          discoverData.folderStructure.subjectFolderId
            ? fetchFolder(discoverData.folderStructure.subjectFolderId)
            : Promise.resolve([]),
          discoverData.folderStructure.subjectSketchesFolderId
            ? fetchFolder(discoverData.folderStructure.subjectSketchesFolderId)
            : Promise.resolve([]),
          discoverData.folderStructure.subjectPhotosFolderId
            ? fetchFolder(discoverData.folderStructure.subjectPhotosFolderId)
            : Promise.resolve([]),
          discoverData.folderStructure.reportMapsFolderId
            ? fetchFolder(discoverData.folderStructure.reportMapsFolderId)
            : Promise.resolve([]),
        ]);

        setEngagementFiles(fetchedEngagement);
        setSubjectFiles(fetchedSubject);
        setSketchFiles(fetchedSketches);
        setPhotoFiles(fetchedPhotos.filter((f) => isImageFile(f.name, f.mimeType)));

        const floodFile = fetchedMaps.find((f) =>
          f.name.toLowerCase().includes("flood"),
        );
        if (floodFile) setFloodMapFile(floodFile);

        // If drive list failed for engagement folder, show error
        if (discoverData.folderStructure.engagementFolderId && fetchedEngagement.length === 0) {
          // Non-fatal - user can still continue
        }

        setStep("engagement");
      } catch (err) {
        console.error("Discovery error:", err);
        setError(err instanceof Error ? err.message : "Discovery failed");
        setStep("select-folder");
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
            setDriveHealthMessage(err.error ?? "Google Drive access expired — sign in again.");
          }
          throw new Error(err.error ?? "Parse failed");
        }

        const result = (await res.json()) as { data: EngagementData };
        merged = mergeEngagementData(merged, result.data);
      }

      setEngagementData(maybeFillReportDueDate(merged));
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
          setDriveHealthMessage(err.error ?? "Google Drive access expired — sign in again.");
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

      // Build processing tasks, starting with project creation (already done)
      const tasks: ProcessingTask[] = [
        { id: "project", label: "Project created", type: "project", status: "done", isCritical: false },
      ];

      // Submit subject docs, capturing document IDs for tracking
      for (const fileId of selectedSubjectFileIds) {
        const file = subjectFiles.find((f) => f.id === fileId);
        if (!file) continue;

        const docType = inferDocumentType(file.name, file.mimeType);
        const res = await fetch("/api/documents", {
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

        if (res.ok) {
          const result = (await res.json()) as { documentId?: string };
          if (result.documentId) {
            tasks.push({
              id: `doc-${result.documentId}`,
              label: file.name,
              type: "doc",
              status: "queued",
              isCritical: true,
            });
          }
        }
      }

      // Submit sketch docs
      for (const fileId of selectedSketchFileIds) {
        const file = sketchFiles.find((f) => f.id === fileId);
        if (!file) continue;

        const res = await fetch("/api/documents", {
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

        if (res.ok) {
          const result = (await res.json()) as { documentId?: string };
          if (result.documentId) {
            tasks.push({
              id: `doc-${result.documentId}`,
              label: file.name,
              type: "doc",
              status: "queued",
              isCritical: true,
            });
          }
        }
      }

      // Submit flood map doc (non-critical — FEMA data already extracted in wizard)
      if (floodMapFile) {
        const res = await fetch("/api/documents", {
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

        if (res.ok) {
          const result = (await res.json()) as { documentId?: string };
          if (result.documentId) {
            tasks.push({
              id: `doc-${result.documentId}`,
              label: floodMapFile.name,
              type: "doc",
              status: "queued",
              isCritical: false,
            });
          }
        }
      }

      // Fire photo analysis (fire-and-forget) if opted in
      if (autoImportPhotos && photoFiles.length > 0 && selectedProject) {
        tasks.push({
          id: "photos",
          label: `Analyze subject photos (${photoFiles.length} images)`,
          type: "photos",
          status: "queued",
          isCritical: false,
        });

        void fetch("/api/photos/process", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectFolderId: selectedProject.id,
            projectId,
          }),
        });

        setExpectedPhotoCount(photoFiles.length);
      }

      // If there are no critical tasks, just redirect immediately
      const criticalCount = tasks.filter((t) => t.isCritical).length;
      if (criticalCount === 0) {
        router.push(`/project/${projectId}`);
        return;
      }

      setProcessingTasks(tasks);
      setShowProcessingModal(true);
    } catch (err) {
      console.error("Finalization error:", err);
      setError(err instanceof Error ? err.message : "Failed to finalize project");
    } finally {
      setIsSubmitting(false);
    }
  }, [
    projectId,
    engagementData,
    selectedSubjectFileIds,
    subjectFiles,
    selectedSketchFileIds,
    sketchFiles,
    floodData,
    floodMapFile,
    autoImportPhotos,
    photoFiles,
    selectedProject,
    router,
  ]);

  const activeStyle = "border-blue-500 bg-blue-600 text-white hover:bg-blue-700";
  const inactiveStyle = "border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700";

  return (
    <div className="relative flex min-h-screen flex-col bg-gray-950 px-4 py-8 sm:px-8">
      {/* Processing status modal */}
      {showProcessingModal && projectId && (
        <ProcessingStatusModal
          projectId={projectId}
          projectName={projectName}
          tasks={processingTasks}
          photoAnalysisCount={photoAnalysisCount}
          expectedPhotoCount={expectedPhotoCount}
          onGoToDashboard={() => router.push(`/project/${projectId}`)}
        />
      )}

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
          {ALL_STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  step === s
                    ? "bg-blue-600 text-white"
                    : ALL_STEPS.indexOf(s) < ALL_STEPS.indexOf(step)
                      ? "bg-blue-900/50 text-blue-300"
                      : "bg-gray-800 text-gray-500"
                }`}
              >
                {i + 1}
              </div>
              {i < ALL_STEPS.length - 1 && (
                <div className="h-px w-4 bg-gray-700" />
              )}
            </div>
          ))}
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
                  <div className="p-6 text-center text-sm text-red-400">{listError}</div>
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

              <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800/50 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Discovered Structure
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                  <span>Subject folder: {folderStructure.subjectFolderId ? "Found" : "—"}</span>
                  <span>Photos folder: {folderStructure.subjectPhotosFolderId ? `Found (${photoFiles.length} images)` : "—"}</span>
                  <span>Reports folder: {folderStructure.reportsFolderId ? "Found" : "—"}</span>
                  <span>Maps folder: {folderStructure.reportMapsFolderId ? "Found" : "—"}</span>
                  <span>Comps folders: {folderStructure.compsFolderIds ? "Found" : "—"}</span>
                  <span>Spreadsheet: {spreadsheetId ? "Found" : spreadsheetCandidates.length > 1 ? "Select below ↓" : "—"}</span>
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
                            isSelected ? "bg-blue-900/20 text-blue-300" : "text-gray-300 hover:bg-gray-800"
                          }`}
                        >
                          <div
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                              isSelected ? "border-blue-500 bg-blue-600" : "border-gray-600 bg-gray-800"
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
                      selectedEngagementFileIds.size > 0 && !isParsingEngagement
                        ? activeStyle
                        : "border-gray-700 bg-gray-800 text-gray-500"
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
                      <label className="mb-1 block text-xs text-gray-500">{label}</label>
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
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Effective Date</label>
                    <input
                      type="date"
                      value={toDateInputValue(engagementData.effectiveDate)}
                      onChange={(e) => {
                        const nextEffective = fromDateInputValue(e.target.value);
                        setEngagementData((prev) => {
                          if (!prev) return prev;
                          return maybeFillReportDueDate({ ...prev, effectiveDate: nextEffective });
                        });
                      }}
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 [color-scheme:dark] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Due Date</label>
                    <input
                      type="date"
                      value={toDateInputValue(engagementData.reportDueDate)}
                      onChange={(e) =>
                        setEngagementData((prev) =>
                          prev ? { ...prev, reportDueDate: fromDateInputValue(e.target.value) } : prev,
                        )
                      }
                      className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 [color-scheme:dark] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
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
                          isSelected ? "bg-blue-900/20 text-blue-300" : "text-gray-300 hover:bg-gray-800"
                        }`}
                      >
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
                            isSelected ? "border-blue-500 bg-blue-600" : "border-gray-600 bg-gray-800"
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
                            isSelected ? "bg-blue-900/20 text-blue-300" : "text-gray-300 hover:bg-gray-800"
                          }`}
                        >
                          <div
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
                              isSelected ? "border-blue-500 bg-blue-600" : "border-gray-600 bg-gray-800"
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
                  onClick={() => setStep("photos")}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${activeStyle}`}
                >
                  Continue
                </button>
              </div>
            </>
          )}

          {/* Step 5: Photos confirmation */}
          {step === "photos" && (
            <>
              <h2 className="mb-2 text-xl font-bold text-gray-100">
                Subject Photos
              </h2>
              <p className="mb-6 text-sm text-gray-400">
                {folderStructure.subjectPhotosFolderId
                  ? `Found ${photoFiles.length} image${photoFiles.length !== 1 ? "s" : ""} in the subject photos folder.`
                  : "No subject photos folder was found in the project structure."}
              </p>

              {photoFiles.length > 0 && (
                <div className="mb-6">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Photo Files
                    </span>
                    <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs font-semibold text-gray-300">
                      {photoFiles.length}
                    </span>
                  </div>
                  <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-700">
                    {photoFiles.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 border-b border-gray-800 last:border-b-0"
                      >
                        <span className="text-gray-500 shrink-0">🖼️</span>
                        <span className="truncate">{f.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!folderStructure.subjectPhotosFolderId && (
                <div className="mb-6 rounded-lg border border-gray-700 bg-gray-800/50 px-4 py-3">
                  <p className="text-sm text-gray-400">
                    No photos folder found. A &quot;photos&quot; subfolder inside the subject folder is required for photo import.
                    You can analyze photos manually from the subject photos page after project creation.
                  </p>
                </div>
              )}

              {/* Auto-import checkbox */}
              <button
                type="button"
                onClick={() => setAutoImportPhotos((v) => !v)}
                disabled={!folderStructure.subjectPhotosFolderId || photoFiles.length === 0}
                className={`flex w-full items-start gap-4 rounded-xl border p-4 text-left transition ${
                  autoImportPhotos && folderStructure.subjectPhotosFolderId && photoFiles.length > 0
                    ? "border-blue-700/60 bg-blue-950/30"
                    : "border-gray-700 bg-gray-800/40"
                } disabled:opacity-40`}
              >
                <div
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition ${
                    autoImportPhotos && folderStructure.subjectPhotosFolderId && photoFiles.length > 0
                      ? "border-blue-500 bg-blue-600"
                      : "border-gray-600 bg-gray-800"
                  }`}
                >
                  {autoImportPhotos && folderStructure.subjectPhotosFolderId && photoFiles.length > 0 && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-100">
                    Auto-import and analyze subject photos
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    Each photo will be classified, labeled, and described using AI. Analysis runs in the background after project creation. Results appear on the subject photos page.
                  </p>
                </div>
              </button>

              <div className="mt-6 flex justify-between">
                <button
                  type="button"
                  onClick={() => setStep("subject-docs")}
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

          {/* Step 6: Flood Map */}
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
                  onClick={() => setStep("photos")}
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

          {/* Step 7: Confirmation */}
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
                        {spreadsheetId.length > 16 ? `${spreadsheetId.slice(0, 16)}...` : spreadsheetId}
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

                {autoImportPhotos && photoFiles.length > 0 && (
                  <div className="flex items-center gap-3 rounded-lg border border-blue-900/40 bg-blue-950/20 px-4 py-3">
                    <span className="text-blue-400 text-lg">📸</span>
                    <p className="text-xs text-blue-200/80">
                      <span className="font-semibold text-blue-100">{photoFiles.length} photos</span> will be analyzed in the background after creation.
                    </p>
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

// ============================================================
// Processing Status Modal
// ============================================================

interface ProcessingStatusModalProps {
  projectId: string;
  projectName: string;
  tasks: ProcessingTask[];
  photoAnalysisCount: number;
  expectedPhotoCount: number;
  onGoToDashboard: () => void;
}

function ProcessingStatusModal({
  projectId: _projectId,
  projectName,
  tasks,
  photoAnalysisCount,
  expectedPhotoCount,
  onGoToDashboard,
}: ProcessingStatusModalProps) {
  const criticalTasks = tasks.filter((t) => t.isCritical);
  const resolvedCritical = criticalTasks.filter(
    (t) => t.status === "done" || t.status === "stuck",
  ).length;
  const allCriticalDone = criticalTasks.length > 0 && resolvedCritical === criticalTasks.length;
  const hasStuck = criticalTasks.some((t) => t.status === "stuck");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/90 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-gray-700/80 bg-gray-900 p-8 shadow-2xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mb-3 flex justify-center">
            {allCriticalDone ? (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-900/40 text-green-400">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-gray-700 border-t-blue-500" />
            )}
          </div>
          <h2 className="text-lg font-bold text-gray-100">
            {allCriticalDone ? "Project Ready" : "Setting Up Project"}
          </h2>
          <p className="mt-1 text-sm text-gray-400 truncate">{projectName}</p>
        </div>

        {/* Progress bar (critical tasks only) */}
        {criticalTasks.length > 0 && (
          <div className="mb-6">
            <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
              <span>Processing documents</span>
              <span>{resolvedCritical} / {criticalTasks.length}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-800">
              <div
                className="h-full rounded-full bg-blue-500 transition-all duration-700 ease-out"
                style={{ width: `${criticalTasks.length > 0 ? (resolvedCritical / criticalTasks.length) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* Task list */}
        <div className="space-y-2">
          {tasks.map((task) => (
            <ProcessingTaskRow
              key={task.id}
              task={task}
              photoAnalysisCount={task.id === "photos" ? photoAnalysisCount : undefined}
              expectedPhotoCount={task.id === "photos" ? expectedPhotoCount : undefined}
            />
          ))}
        </div>

        {/* Footer actions */}
        <div className="mt-8 border-t border-gray-800 pt-6">
          {allCriticalDone ? (
            <div className="text-center">
              {hasStuck && (
                <p className="mb-2 text-xs text-amber-400/80">
                  Some documents failed to process. You can reprocess them from the project dashboard.
                </p>
              )}
              <p className="mb-3 text-sm text-green-400">Redirecting to dashboard...</p>
              <button
                type="button"
                onClick={onGoToDashboard}
                className="w-full rounded-lg border border-blue-500 bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Go to Dashboard
              </button>
            </div>
          ) : (
            <div className="text-center">
              <p className="mb-3 text-xs text-gray-500">
                You can open the dashboard while processing continues in the background.
              </p>
              <button
                type="button"
                onClick={onGoToDashboard}
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-4 py-2.5 text-sm font-medium text-gray-300 transition hover:bg-gray-700"
              >
                Open Dashboard Now
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProcessingTaskRow({
  task,
  photoAnalysisCount,
  expectedPhotoCount,
}: {
  task: ProcessingTask;
  photoAnalysisCount?: number;
  expectedPhotoCount?: number;
}) {
  const isPhotos = task.id === "photos";

  const statusConfig = {
    done: {
      icon: (
        <svg className="h-4 w-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ),
      badge: (
        <span className="rounded-full bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-400">
          Done
        </span>
      ),
    },
    queued: {
      icon: (
        <svg className="h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M12 7v5l3 3" />
        </svg>
      ),
      badge: (
        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-500">
          Queued
        </span>
      ),
    },
    background: {
      icon: (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-700 border-t-blue-400" />
      ),
      badge: (
        <span className="rounded-full bg-blue-950/50 px-2 py-0.5 text-xs font-medium text-blue-400">
          Analyzing
        </span>
      ),
    },
    stuck: {
      icon: (
        <svg className="h-4 w-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      ),
      badge: (
        <span className="rounded-full bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-400">
          Timed out
        </span>
      ),
    },
  };

  const config = statusConfig[task.status];

  const label = isPhotos && task.status !== "queued" && photoAnalysisCount !== undefined
    ? `${task.label.split("(")[0]?.trim() ?? task.label} (${photoAnalysisCount}${expectedPhotoCount ? ` / ${expectedPhotoCount}` : ""} analyzed)`
    : task.label;

  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 transition-colors ${
      task.status === "done"
        ? "bg-green-950/20"
        : task.status === "stuck"
          ? "bg-amber-950/20"
          : task.status === "background"
            ? "bg-blue-950/10"
            : "bg-gray-800/40"
    }`}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0">{config.icon}</div>
        <span className={`truncate text-sm ${
          task.status === "done" ? "text-gray-300"
          : task.status === "stuck" ? "text-amber-300/80"
          : "text-gray-400"
        }`}>
          {label}
        </span>
      </div>
      <div className="shrink-0">{config.badge}</div>
    </div>
  );
}

// ============================================================
// Helper functions
// ============================================================

function mergeEngagementData(existing: EngagementData, incoming: EngagementData): EngagementData {
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
  if (lower.includes("cad") || lower.includes("appraisal district")) return "cad";
  if (lower.includes("zoning")) return "zoning_map";
  if (lower.includes("engagement") || lower.includes("proposal")) return "engagement";
  if (lower.includes("notes")) return "notes";
  if (lower.includes("sketch")) return "sketch";
  if (lower.includes("survey") || lower.includes("plat")) return "other";
  return "other";
}

const DATE_PARSE_REF = new Date(2000, 0, 1);

function reportDueDateIsUnset(raw: string): boolean {
  const d = parseEngagementDateToDate(raw);
  return d === null;
}

function toDateInputValue(value: string | undefined): string {
  if (!value?.trim()) return "";
  const d = parseEngagementDateToDate(value);
  return d ? format(d, "yyyy-MM-dd") : "";
}

function fromDateInputValue(value: string): string {
  if (!value) return "";
  const d = parse(value, "yyyy-MM-dd", DATE_PARSE_REF);
  return isValid(d) ? format(d, "MM/dd/yyyy") : "";
}

const REPORT_DUE_DAYS_AFTER_EFFECTIVE = 21;

function maybeFillReportDueDate(data: EngagementData): EngagementData {
  const effective = parseEngagementDateToDate(data.effectiveDate);
  if (!effective) return data;
  if (!reportDueDateIsUnset(data.reportDueDate)) return data;

  const due = addDays(effective, REPORT_DUE_DAYS_AFTER_EFFECTIVE);
  return { ...data, reportDueDate: format(due, "MM/dd/yyyy") };
}

function parseAddressParts(address: string): {
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
} {
  if (!address) return {};

  const p1 = /,\s*([^,]+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i.exec(address);
  if (p1) return { city: p1[1]?.trim(), state: p1[2]?.toUpperCase(), zip: p1[3] };

  const p2 = /\s+(\S+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i.exec(address);
  if (p2) return { city: p2[1]?.trim(), state: p2[2]?.toUpperCase(), zip: p2[3] };

  const p3 = /,\s*([^,]+),\s*([A-Z]{2})\s*$/i.exec(address);
  if (p3) return { city: p3[1]?.trim(), state: p3[2]?.toUpperCase() };

  const p4 = /\s+(\S+)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/i.exec(address);
  if (p4) return { city: p4[1]?.trim(), state: p4[2]?.toUpperCase(), zip: p4[3] };

  return {};
}
