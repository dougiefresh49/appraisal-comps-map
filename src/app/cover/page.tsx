"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  PROJECTS_STORAGE_KEY,
  CURRENT_PROJECT_STORAGE_KEY,
  normalizeProjectsMap,
  getNextProjectName,
  createDefaultProject,
  type ProjectData,
  type ProjectsMap,
} from "~/utils/projectStore";

export default function CoverPage() {
  const searchParams = useSearchParams();
  const projectParam = searchParams.get("project") ?? undefined;

  const projectStoreRef = useRef<ProjectsMap>({});
  const [projectName, setProjectName] = useState<string>(
    projectParam ?? "Project 1",
  );
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [isStateHydrated, setIsStateHydrated] = useState(false);
  const [clientCompany, setClientCompany] = useState("");
  const [clientName, setClientName] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [coverSize, setCoverSize] = useState(1.5);
  const [imageSize, setImageSize] = useState(1.0); // Multiplier for image size (1.0 = 320x204, larger = 450x264)
  const [subjectPhotoUrl, setSubjectPhotoUrl] = useState<string | null>(null);
  const [isLoadingCoverData, setIsLoadingCoverData] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  const applyProjectState = useCallback((data: ProjectData) => {
    setProjectData(data);
    setClientCompany(data.clientCompany ?? "");
    setClientName(data.clientName ?? "");
    setPropertyType(data.propertyType ?? "");
    setHasInitialized(true);
  }, []);

  const persistCurrentProjectState = useCallback(() => {
    if (!projectName || !projectData || !hasInitialized) return;
    if (typeof window === "undefined") return;

    // Only update fields that have been explicitly changed by the user
    // Preserve all other fields from projectData
    const updatedProject: ProjectData = {
      ...projectData, // Preserve all existing fields
      clientCompany: clientCompany || projectData.clientCompany,
      clientName: clientName || projectData.clientName,
      propertyType: propertyType || projectData.propertyType,
    };

    projectStoreRef.current[projectName] = updatedProject;
    setProjectData(updatedProject);

    try {
      window.localStorage.setItem(
        PROJECTS_STORAGE_KEY,
        JSON.stringify(projectStoreRef.current),
      );
      window.localStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, projectName);
    } catch (error) {
      console.error("Failed to persist project state", error);
    }
  }, [projectName, projectData, clientCompany, clientName, propertyType]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!isStateHydrated) return;
    const interval = setInterval(() => {
      persistCurrentProjectState();
    }, 30000);
    return () => clearInterval(interval);
  }, [isStateHydrated, persistCurrentProjectState]);

  // Save on field changes (only after initialization)
  useEffect(() => {
    if (!isStateHydrated || !hasInitialized) return;
    const timeoutId = setTimeout(() => {
      persistCurrentProjectState();
    }, 1000);
    return () => clearTimeout(timeoutId);
  }, [
    clientCompany,
    clientName,
    propertyType,
    isStateHydrated,
    hasInitialized,
    persistCurrentProjectState,
  ]);

  // Hydrate state from localStorage
  useEffect(() => {
    if (isStateHydrated) return;
    if (typeof window === "undefined") return;

    let projectStore: ProjectsMap = {};
    const stored = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Record<
          string,
          Partial<ProjectData>
        >;
        projectStore = normalizeProjectsMap(parsed);
      } catch (error) {
        console.error("Failed to parse stored projects", error);
      }
    }

    let selectedProjectName =
      projectParam ??
      window.localStorage.getItem(CURRENT_PROJECT_STORAGE_KEY) ??
      undefined;

    const projectKeys = Object.keys(projectStore);
    if (!selectedProjectName || !projectStore[selectedProjectName]) {
      if (projectKeys.length > 0) {
        selectedProjectName = projectKeys[0];
      } else {
        const defaultName = getNextProjectName([]);
        projectStore[defaultName] = createDefaultProject();
        selectedProjectName = defaultName;
      }
    }

    const finalProjectName = selectedProjectName as string;

    projectStoreRef.current = projectStore;
    setProjectName(finalProjectName);
    const project = projectStore[finalProjectName];
    if (project) {
      applyProjectState(project);
    }

    try {
      window.localStorage.setItem(
        PROJECTS_STORAGE_KEY,
        JSON.stringify(projectStore),
      );
      window.localStorage.setItem(
        CURRENT_PROJECT_STORAGE_KEY,
        finalProjectName,
      );
    } catch (error) {
      console.error("Failed to persist projects", error);
    }

    setIsStateHydrated(true);
  }, [applyProjectState, isStateHydrated, projectParam]);

  // Initialize cover data from project data (no initial webhook fetch needed)
  useEffect(() => {
    if (!isStateHydrated || !projectData) return;

    // Set initial values from project data
    if (projectData.propertyType) {
      setPropertyType(projectData.propertyType);
    }
    if (projectData.clientName) {
      setClientName(projectData.clientName);
    }
    if (projectData.clientCompany) {
      setClientCompany(projectData.clientCompany);
    }
    // Note: subjectPhotoUrl is not stored in project data, it's fetched on demand
  }, [isStateHydrated, projectData]);

  if (!projectData) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const subjectAddress =
    projectData.subject.info.addressForDisplay ||
    projectData.subject.info.address ||
    "";

  return (
    <>
      {/* Print styles */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            /* Hide sidebar when printing */
            aside {
              display: none !important;
            }
            
            /* Make main content full width */
            main {
              width: 100% !important;
              max-width: 100% !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            
            /* Ensure cover page is centered and properly sized */
            body {
              margin: 0;
              padding: 0;
              background: white;
            }
            
            /* Hide any other UI elements */
            .no-print {
              display: none !important;
            }
          }
        `
      }} />
      
      <div className="flex h-screen w-full bg-white">
        {/* Side Panel */}
        <aside className="w-80 overflow-y-auto border-r border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            Cover Page
          </h2>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                Property Type
              </label>
              <input
                type="text"
                value={propertyType}
                onChange={(e) => setPropertyType(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="Commercial Office Building"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                Subject Address
              </label>
              <div className="rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {subjectAddress || "No address set"}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                From subject addressForDisplay
              </p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                Client Company
              </label>
              <input
                type="text"
                value={clientCompany}
                onChange={(e) => setClientCompany(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="Winkler County Hospital District"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold tracking-wide text-gray-600 uppercase">
                Client Name
              </label>
              <input
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="Lorenzo Serrano"
              />
            </div>

            {/* Cover Data Status */}
            {projectData?.projectFolderId && (
              <div className="mt-6 border-t border-gray-200 pt-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Cover Data
                </label>
                {isLoadingCoverData ? (
                  <div className="text-xs text-gray-500">
                    Loading cover data...
                  </div>
                ) : (
                  <div className="space-y-2 text-xs text-gray-500">
                    <div>Data fetched from webhook</div>
                    {subjectPhotoUrl && (
                      <div className="mt-2 rounded bg-gray-100 p-2 text-[10px] break-all">
                        <div className="font-semibold">Image URL:</div>
                        <div className="mt-1 line-clamp-2 break-all">
                          {subjectPhotoUrl}
                        </div>
                      </div>
                    )}
                    {!subjectPhotoUrl && (
                      <div className="mt-2 text-orange-600">
                        No image URL available
                      </div>
                    )}
                  </div>
                )}
                <button
                  onClick={async () => {
                    if (!projectData?.projectFolderId) return;
                    setIsLoadingCoverData(true);
                    try {
                      const response = await fetch(
                        "https://dougiefreshdesigns.app.n8n.cloud/webhook/subject-photo-data",
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({
                            projectFolderId: projectData.projectFolderId,
                          }),
                        },
                      );

                      if (!response.ok) {
                        throw new Error(
                          `Failed to fetch subject photo data: ${response.statusText}`,
                        );
                      }

                      const photoData = (await response.json()) as {
                        subjectPhotoBase64?: string;
                        subjectPhotosFolderId?: string;
                      };

                      if (photoData) {
                        // Update subjectPhotosFolderId if provided
                        if (photoData.subjectPhotosFolderId) {
                          const updatedProject: ProjectData = {
                            ...projectData, // Preserve all existing fields
                            subjectPhotosFolderId:
                              photoData.subjectPhotosFolderId,
                          };
                          projectStoreRef.current[projectName] = updatedProject;
                          setProjectData(updatedProject);

                          try {
                            window.localStorage.setItem(
                              PROJECTS_STORAGE_KEY,
                              JSON.stringify(projectStoreRef.current),
                            );
                          } catch (error) {
                            console.error(
                              "Failed to persist subjectPhotosFolderId",
                              error,
                            );
                          }
                        }

                        // Update image from base64 data
                        if (photoData.subjectPhotoBase64) {
                          const dataUrl = `data:image/jpeg;base64,${photoData.subjectPhotoBase64}`;
                          console.log(
                            "Refresh - Setting image from base64 data",
                          );
                          setSubjectPhotoUrl(dataUrl);
                        } else {
                          console.warn(
                            "Refresh - No image data found in photo data",
                          );
                        }
                      }
                    } catch (error) {
                      console.error("Error fetching cover data:", error);
                    } finally {
                      setIsLoadingCoverData(false);
                    }
                  }}
                  className="mt-2 rounded-md border border-blue-600 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                  disabled={isLoadingCoverData}
                >
                  Refresh Cover Data
                </button>
              </div>
            )}

            {/* Image Size Controls */}
            <div className="mt-6 border-t border-gray-200 pt-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Image Size
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setImageSize(Math.max(0.5, imageSize - 0.1))}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  title="Decrease image size"
                >
                  −
                </button>
                <span className="min-w-[60px] text-center text-sm font-medium text-gray-700">
                  {Math.round(imageSize * 100)}%
                </span>
                <button
                  onClick={() => setImageSize(Math.min(2.0, imageSize + 0.1))}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  title="Increase image size"
                >
                  +
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Base: 320×204px | Large: 450×264px | Current:{" "}
                {Math.round(320 * imageSize)}×{Math.round(204 * imageSize)}px
              </div>
            </div>

            {/* Cover Size Controls */}
            <div className="mt-6 border-t border-gray-200 pt-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Cover Size
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCoverSize(Math.max(0.5, coverSize - 0.1))}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  title="Decrease cover size"
                >
                  −
                </button>
                <span className="min-w-[60px] text-center text-sm font-medium text-gray-700">
                  {Math.round(coverSize * 100)}%
                </span>
                <button
                  onClick={() => setCoverSize(Math.min(3.0, coverSize + 0.1))}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  title="Increase cover size"
                >
                  +
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500">
                Base: 612×792px (100%) | Current: {Math.round(612 * coverSize)}×
                {Math.round(792 * coverSize)}px
              </div>
            </div>

            {/* Print to PDF Button */}
            <div className="mt-6 border-t border-gray-200 pt-6">
              <button
                onClick={() => {
                  window.print();
                }}
                className="w-full rounded-md border-2 border-blue-600 bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                Print to PDF
              </button>
              <p className="mt-2 text-xs text-gray-500">
                Opens browser print dialog. Select "Save as PDF" as destination.
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Cover Page Content */}
      <main className="flex flex-1 items-center justify-center overflow-auto bg-gray-50 p-8">
        <div
          className="relative flex flex-col overflow-hidden bg-white shadow-2xl"
          style={{
            width: "612px",
            height: "792px",
            transform: `scale(${coverSize})`,
            transformOrigin: "center center",
          }}
        >
          {/* Top Section - Branding (180px tall) */}
          <div className="relative h-[180px]">
            {/* Logo Section */}
            <div className="flex h-full items-start justify-between px-12 pt-8 pb-4">
              {/* Logo Mark (left) */}
              <div className="flex-shrink-0">
                <img
                  src="/svgs/logo-mark.svg"
                  alt="Basin Appraisals Logo Mark"
                  width={67}
                  height={50}
                  className="h-auto"
                />
              </div>

              {/* Main Logo (center) */}
              <div className="flex flex-1 flex-col items-center">
                <img
                  src="/svgs/logo.svg"
                  alt="Basin Appraisals"
                  width={213}
                  height={135}
                  className="h-auto"
                />
              </div>

              {/* Spacer for balance */}
              <div className="w-[67px]"></div>
            </div>

            {/* Teal Band */}
            <div className="absolute right-0 bottom-0 left-0 h-3 bg-[#15616D]"></div>
          </div>

          {/* Main Content Area - padding: 56px top, 100px right, 100px bottom, 100px left */}
          <div
            className="flex flex-1 flex-col items-center justify-center"
            style={{ padding: "56px 100px 100px 100px" }}
          >
            {/* Photo - Dynamic size based on imageSize multiplier */}
            <div
              className="overflow-hidden rounded-lg border border-gray-300 shadow-sm"
              style={{
                width: imageSize >= 1.40625 ? "450px" : `${320 * imageSize}px`,
                height: imageSize >= 1.40625 ? "264px" : `${204 * imageSize}px`,
                marginBottom: imageSize >= 1.40625 ? "16px" : "40px",
              }}
            >
              {subjectPhotoUrl ? (
                <img
                  src={subjectPhotoUrl}
                  alt="Subject Property"
                  className="h-full w-full object-cover"
                  onLoad={() => console.log("Image loaded successfully")}
                  onError={(e) => {
                    console.error("Image failed to load:", subjectPhotoUrl, e);
                    // If using a data URL, it shouldn't fail, so this is likely a URL-based image
                    // Clear the URL to show placeholder
                    if (!subjectPhotoUrl?.startsWith("data:")) {
                      console.warn(
                        "Image URL failed, clearing to show placeholder",
                      );
                      setSubjectPhotoUrl(null);
                    }
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gray-200">
                  <span className="text-sm text-gray-400">Property Photo</span>
                </div>
              )}
            </div>

            {/* Text Section - Vertically centered column with 16px gap between each text element */}
            <div className="flex flex-col items-center justify-center">
              {/* Appraisal Report Label */}
              <p
                className="font-sans text-[11px] tracking-wider text-[#5A5463] uppercase"
                style={{ marginBottom: imageSize >= 1.40625 ? "8px" : "16px" }}
              >
                APPRAISAL REPORT
              </p>

              {/* Property Type */}
              <h1
                className="text-center font-sans text-[21px] font-bold tracking-wide text-[#0E0D0D] uppercase"
                style={{ marginBottom: imageSize >= 1.40625 ? "12px" : "16px" }}
              >
                {propertyType || "COMMERCIAL OFFICE BUILDING"}
              </h1>

              {/* Property Address */}
              {subjectAddress ? (
                <div
                  className="flex flex-col items-center"
                  style={{ marginBottom: "16px" }}
                >
                  <p className="font-sans text-[14px] text-[#0E0D0D]">
                    {subjectAddress.split(",")[0]?.trim()}
                  </p>
                  {subjectAddress.includes(",") && (
                    <p className="font-sans text-[14px] text-[#0E0D0D]">
                      {subjectAddress.split(",").slice(1).join(",").trim()}
                    </p>
                  )}
                </div>
              ) : (
                <p
                  className="font-sans text-[14px] text-[#0E0D0D] italic"
                  style={{ marginBottom: "16px" }}
                >
                  No address set
                </p>
              )}

              {/* Client Section */}
              <div className="flex flex-col items-center">
                <p
                  className="font-sans text-[11px] text-[#5A5463] italic"
                  style={{ marginBottom: "4px" }}
                >
                  CLIENT
                </p>
                {clientCompany && (
                  <p className="font-sans text-[14px] text-[#0E0D0D]">
                    {clientCompany}
                  </p>
                )}
                {clientName && (
                  <p className="font-sans text-[14px] text-[#0E0D0D]">
                    {clientName}
                  </p>
                )}
                {!clientCompany && !clientName && (
                  <p className="font-sans text-[14px] text-[#0E0D0D] italic">
                    No client information
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Blue Ribbon above Footer */}
          <div className="absolute right-0 bottom-14 left-0 h-3 bg-[#15616D]"></div>

          {/* Footer */}
          <div className="absolute right-0 bottom-0 left-0 flex h-14 items-center justify-center bg-[#0E0D0D]">
            <p className="text-[12px] font-medium text-white">
              Basin Appraisals LLC
            </p>
          </div>
        </div>
      </main>
    </div>
    </>
  );
}
