"use client";

import { useCallback, useEffect, useState, use } from "react";
import { useProject } from "~/hooks/useProject";
import { env } from "~/env";
import { upsertProjectMetadata } from "~/lib/supabase-queries";

interface CoverPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export default function ProjectCoverPage({ params }: CoverPageProps) {
  const { projectId } = use(params);
  const { project, isLoading, updateProject } = useProject(projectId);

  const [clientCompany, setClientCompany] = useState("");
  const [clientName, setClientName] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [coverSize, setCoverSize] = useState(1.5);
  const [imageSize, setImageSize] = useState(1.0);
  const [subjectPhotoUrl, setSubjectPhotoUrl] = useState<string | null>(null);
  const [isLoadingCoverData, setIsLoadingCoverData] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    if (!project || hasInitialized) return;
    setClientCompany(project.clientCompany ?? "");
    setClientName(project.clientName ?? "");
    setPropertyType(project.propertyType ?? "");
    setHasInitialized(true);
  }, [project, hasInitialized]);

  const persistFields = useCallback(() => {
    if (!hasInitialized || !project) return;
    updateProject((prev) => ({
      ...prev,
      clientCompany: clientCompany || prev.clientCompany,
      clientName: clientName || prev.clientName,
      propertyType: propertyType || prev.propertyType,
    }));
  }, [
    hasInitialized,
    project,
    clientCompany,
    clientName,
    propertyType,
    updateProject,
  ]);

  useEffect(() => {
    if (!hasInitialized) return;
    const timeoutId = setTimeout(persistFields, 1000);
    return () => clearTimeout(timeoutId);
  }, [clientCompany, clientName, propertyType, hasInitialized, persistFields]);

  if (isLoading || !project) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  const subjectAddress =
    project.subject.addressForDisplay ?? project.subject.address ?? "";

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
        <div className="no-print w-80 overflow-y-auto border-r border-gray-200 bg-white p-6 shadow-sm">
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

            {project?.projectFolderId && (
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
                    if (!project?.projectFolderId) return;
                    setIsLoadingCoverData(true);
                    try {
                      const response = await fetch(
                        env.NEXT_PUBLIC_N8N_WEBHOOK_BASE_URL +
                          "/subject-photo-data",
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            projectFolderId: project.projectFolderId,
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
                          updateProject((prev) => ({
                            ...prev,
                            subjectPhotosFolderId:
                              photoData.subjectPhotosFolderId,
                          }));
                          await upsertProjectMetadata(projectId, {
                            subjectPhotosFolderId:
                              photoData.subjectPhotosFolderId,
                          });
                        }

                        if (photoData.subjectPhotoBase64) {
                          setSubjectPhotoUrl(
                            `data:image/jpeg;base64,${photoData.subjectPhotoBase64}`,
                          );
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

            <div className="mt-6 border-t border-gray-200 pt-6">
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Cover Size
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCoverSize(Math.max(0.5, coverSize - 0.05))}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  −
                </button>
                <span className="min-w-[60px] text-center text-sm font-medium text-gray-700">
                  {Math.round(coverSize * 100)}%
                </span>
                <button
                  onClick={() => setCoverSize(Math.min(3.0, coverSize + 0.05))}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  +
                </button>
              </div>
            </div>

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
            <div className="relative h-[180px]">
              <div className="flex h-full items-start justify-between px-12 pt-8 pb-4">
                <div className="flex-shrink-0">
                  <img
                    src="/svgs/logo-mark.svg"
                    alt="Basin Appraisals Logo Mark"
                    width={67}
                    height={50}
                    className="h-auto"
                  />
                </div>
                <div className="flex flex-1 flex-col items-center">
                  <img
                    src="/svgs/logo.svg"
                    alt="Basin Appraisals"
                    width={213}
                    height={135}
                    className="h-auto"
                  />
                </div>
                <div className="w-[67px]"></div>
              </div>
              <div className="absolute right-0 bottom-0 left-0 h-3 bg-[#15616D]"></div>
            </div>

            <div
              className="flex flex-1 flex-col items-center justify-center"
              style={{ padding: "56px 100px 100px 100px" }}
            >
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
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gray-200">
                    <span className="text-sm text-gray-400">
                      Property Photo
                    </span>
                  </div>
                )}
              </div>

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

            <div className="absolute right-0 bottom-14 left-0 h-3 bg-[#15616D]"></div>

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
