"use client";

import { useCallback, useEffect, useRef, useState, use } from "react";
import {
  PROJECTS_STORAGE_KEY,
  CURRENT_PROJECT_STORAGE_KEY,
  normalizeProjectsMap,
  createDefaultProject,
  type ProjectData,
  type ProjectsMap,
} from "~/utils/projectStore";
import { env } from "~/env";

interface CoverPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default function ProjectCoverPage({ params }: CoverPageProps) {
  const { projectId } = use(params);
  const decodedProjectId = decodeURIComponent(projectId);

  const projectStoreRef = useRef<ProjectsMap>({});
  
  // We don't need `projectName` state to be selectable, it's fixed by URL
  // but we keep it for compatibility with existing logic functions
  const projectName = decodedProjectId; 
  
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [isStateHydrated, setIsStateHydrated] = useState(false);
  const [clientCompany, setClientCompany] = useState("");
  const [clientName, setClientName] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [coverSize, setCoverSize] = useState(1.5);
  const [imageSize, setImageSize] = useState(1.0); 
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
    const updatedProject: ProjectData = {
      ...projectData, 
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
      // Ensure this is marked as current project
      window.localStorage.setItem(CURRENT_PROJECT_STORAGE_KEY, projectName);
    } catch (error) {
      console.error("Failed to persist project state", error);
    }
  }, [projectName, projectData, clientCompany, clientName, propertyType, hasInitialized]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!isStateHydrated) return;
    const interval = setInterval(() => {
      persistCurrentProjectState();
    }, 30000);
    return () => clearInterval(interval);
  }, [isStateHydrated, persistCurrentProjectState]);

  // Save on field changes
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

    // Initialize if not exists
    if (!projectStore[projectName]) {
       // This is a new project purely from URL? Handle gracefully or create it?
       // Usually we expect it to exist if navigating here.
       // But if it doesn't, we might create a default one or show error.
       // For robustness, let's create default if missing, but preferably warn.
       console.warn(`Project ${projectName} not found in storage, creating default.`);
       projectStore[projectName] = createDefaultProject();
    }

    projectStoreRef.current = projectStore;
    const project = projectStore[projectName];
    if (project) {
      applyProjectState(project);
    }

    // Persist ensures if we created a default, it saves.
    try {
      window.localStorage.setItem(
        PROJECTS_STORAGE_KEY,
        JSON.stringify(projectStore),
      );
      window.localStorage.setItem(
        CURRENT_PROJECT_STORAGE_KEY,
        projectName,
      );
    } catch (error) {
      console.error("Failed to persist projects", error);
    }

    setIsStateHydrated(true);
  }, [applyProjectState, isStateHydrated, projectName]);

  // Initialize cover data from project data
  useEffect(() => {
    if (!isStateHydrated || !projectData) return;

    if (projectData.propertyType) {
      setPropertyType(projectData.propertyType);
    }
    if (projectData.clientName) {
      setClientName(projectData.clientName);
    }
    if (projectData.clientCompany) {
      setClientCompany(projectData.clientCompany);
    }
  }, [isStateHydrated, projectData]);

  if (!projectData) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const subjectAddress =
    projectData.subject.info.addressForDisplay ??
    projectData.subject.info.address ??
    "";

  /* eslint-disable @next/next/no-img-element */
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @media print {
            aside { display: none !important; }
            main { width: 100% !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
            body { margin: 0; padding: 0; background: white; }
            .no-print { display: none !important; }
          }
        `,
        }}
      />

      <div className="flex h-full w-full bg-white">
        {/* Settings Panel - simplified as we are already inside a layout with sidebar */}
        <div className="w-80 overflow-y-auto border-r border-gray-200 bg-white p-6 shadow-sm no-print">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Cover Page Settings
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
                          env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL +
                            "subject-photo-data",
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
                          if (photoData.subjectPhotosFolderId) {
                            const updatedProject: ProjectData = {
                              ...projectData, 
                              subjectPhotosFolderId:
                                photoData.subjectPhotosFolderId,
                            };
                            projectStoreRef.current[projectName] =
                              updatedProject;
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

                          if (photoData.subjectPhotoBase64) {
                            const dataUrl = `data:image/jpeg;base64,${photoData.subjectPhotoBase64}`;
                            setSubjectPhotoUrl(dataUrl);
                          } else {
                            setSubjectPhotoUrl(null);
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
                  >
                    −
                  </button>
                  <span className="min-w-[60px] text-center text-sm font-medium text-gray-700">
                    {Math.round(imageSize * 100)}%
                  </span>
                  <button
                    onClick={() => setImageSize(Math.min(2.0, imageSize + 0.1))}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    +
                  </button>
                </div>
              </div>

               {/* Cover Size Controls */}
               <div className="mt-6 border-t border-gray-200 pt-6">
                <label className="mb-2 block text-sm font-medium text-gray-700">
                  Cover Size
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() =>
                      setCoverSize(Math.max(0.5, coverSize - 0.05))
                    }
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    −
                  </button>
                  <span className="min-w-[60px] text-center text-sm font-medium text-gray-700">
                    {Math.round(coverSize * 100)}%
                  </span>
                  <button
                    onClick={() =>
                      setCoverSize(Math.min(3.0, coverSize + 0.05))
                    }
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                  >
                    +
                  </button>
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
              </div>
            </div>
        </div>

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

            {/* Main Content Area */}
            <div
              className="flex flex-1 flex-col items-center justify-center"
              style={{ padding: "56px 100px 100px 100px" }}
            >
              {/* Photo */}
              <div
                className="overflow-hidden rounded-lg border border-gray-300 shadow-sm"
                style={{
                  width:
                    imageSize >= 1.40625 ? "450px" : `${320 * imageSize}px`,
                  height:
                    imageSize >= 1.40625 ? "264px" : `${204 * imageSize}px`,
                  marginBottom: imageSize >= 1.40625 ? "16px" : "40px",
                }}
              >
                {subjectPhotoUrl ? (
                  <img
                    src={subjectPhotoUrl}
                    alt="Subject Property"
                    className="h-full w-full object-cover"
                    onError={(_e) => {
                       if (!subjectPhotoUrl?.startsWith("data:")) {
                        setSubjectPhotoUrl(null);
                      }
                    }}
                  />
                ) : ( // ...
                  <div className="flex h-full w-full items-center justify-center bg-gray-200">
                    <span className="text-sm text-gray-400">
                      Property Photo
                    </span>
                  </div>
                )}
              </div>

              {/* Text Section */}
              <div className="flex flex-col items-center justify-center">
                <p
                  className="font-sans text-[11px] tracking-wider text-[#5A5463] uppercase"
                  style={{
                    marginBottom: imageSize >= 1.40625 ? "8px" : "16px",
                  }}
                >
                  APPRAISAL REPORT
                </p>

                <h1
                  className="text-center font-sans text-[21px] font-bold tracking-wide text-[#0E0D0D] uppercase"
                  style={{
                    marginBottom: imageSize >= 1.40625 ? "12px" : "16px",
                  }}
                >
                  {propertyType || "COMMERCIAL OFFICE BUILDING"}
                </h1>

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
