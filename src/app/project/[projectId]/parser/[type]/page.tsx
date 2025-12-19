"use client";

/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { useSearchParams } from "next/navigation";
import { use, useEffect, useState } from "react";

interface ParserPageProps {
  params: Promise<{
    projectId: string;
    type: string;
  }>;
}

interface FolderDetailsResponse {
  folderId: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parsedContent?: any;
}

interface ParserResponseItem {
  id: string;
}

type ParserResponse = ParserResponseItem[];




interface N8nExistsResponse {
  exists: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  matches: any[];
}

import { useProject } from "~/hooks/useProject";
import { JsonViewer } from "~/components/JsonViewer";

export default function ParserPage({ params }: ParserPageProps) {
  const { projectId, type } = use(params);
  const searchParams = useSearchParams();
  const folderId = searchParams.get("folderId");

  const [extraContext, setExtraContext] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parsedContent, setParsedContent] = useState<any>(undefined);
  const [isParsing, setIsParsing] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  
  // Check Import Status State
  const [isCheckModalOpen, setIsCheckModalOpen] = useState(false);
  const [checkQuery, setCheckQuery] = useState("");
  const [checkInstrument, setCheckInstrument] = useState("");
  const [checkApn, setCheckApn] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [checkMatches, setCheckMatches] = useState<any[] | undefined>(undefined);
  
  const [isChecking, setIsChecking] = useState(false);
  const [isImported, setIsImported] = useState<boolean | undefined>(undefined);

  const { project, isLoading: isProjectLoading } = useProject(projectId);
  const projectFolderId = project?.projectFolderId;

  // Effect to load folder details
  useEffect(() => {
    if (isProjectLoading) return;
    if (!folderId || !projectFolderId) {
        setParsedContent(undefined);
        setFolderName("");
        setIsImported(undefined);
        return;
    }

    async function loadFolderDetails() {
        setIsLoadingDetails(true);
        try {
             const response = await fetch("/api/comps-folder-details", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectFolderId, folderId, type }),
            });
            const data = (await response.json()) as FolderDetailsResponse;
            setFolderName(data.name);
            setParsedContent(data.parsedContent);
            setExtraContext("");
            // Reset import status on folder change
            setIsImported(undefined);
        } catch (e) {
            console.error("Failed to load details", e);
        } finally {
            setIsLoadingDetails(false);
        }
    }
    void loadFolderDetails();
  }, [folderId, projectFolderId, type, isProjectLoading]);

  const handleOpenCheckModal = () => {
    setCheckQuery(folderName);
    setCheckInstrument("");
    setCheckApn("");
    setCheckMatches(undefined);
    setIsCheckModalOpen(true);
  };
  const handleCheckImport = async () => {
    if (!projectFolderId) return;
    setIsChecking(true);
    setCheckMatches(undefined); // Reset matches on new check
    
    try {
      const response = await fetch("/api/comps-exists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportFolderId: projectFolderId,
          type,
          query: checkQuery,
          instrumentNumber: checkInstrument,
          apn: checkApn
        }),
      });
      
      const data = (await response.json()) as N8nExistsResponse[];
      const result = data[0];
      
      if (result) {
        setIsImported(result.exists);
        // Matches is explicitly any[] in interface, so safe to assign to matches state
        setCheckMatches(result.matches ?? []);
      }
      // Note: We keep the modal open to show results
    } catch (e) {
      console.error("Failed to check import status", e);
      alert("Failed to check status");
    } finally {
      setIsChecking(false);
    }
  };


  const handleParse = async () => {
    if (!folderId || !projectFolderId) return;

    setIsParsing(true);
    try {
      const response = await fetch("/api/comps-parser", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type,
          folderId,
          projectFolderId,
          extraContext,
          prevParsedContent: parsedContent,
        }),
      });

      const data = (await response.json()) as ParserResponse;

      if (Array.isArray(data) && data[0]?.id) {
        alert(`Parsing triggered successfully. File ID: ${data[0].id}`);
      } else {
        alert("Parsing failed or unexpected response");
      }
    } catch (error) {
      console.error("Parsing error:", error);
      alert("Parsing error");
    } finally {
      setIsParsing(false);
    }
  };

  if (!folderId) {
    return (
      <div className="flex h-full items-center justify-center text-gray-500">
        Please select a folder from the sidebar to begin.
      </div>
    );
  }

  if (isLoadingDetails) {
       return (
      <div className="flex h-full items-center justify-center text-gray-500">
        Loading folder details...
      </div>
    );
  }

  const isParsed = !!parsedContent;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{folderName}</h2>
          <div className="mt-1 flex items-center space-x-2">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${isParsed ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                  {isParsed ? "Parsed" : "Not Parsed"}
              </span>
              <span className="text-sm text-gray-500 capitalize">{type}</span>
              {isImported === true && (
                 <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                    Imported
                 </span>
              )}
              {isImported === false && (
                 <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                    Not Imported
                 </span>
              )}
          </div>
        </div>
        <button
            onClick={handleOpenCheckModal}
            className="rounded bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
        >
            Check Import Status
        </button>
      </div>

      <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-900/5">
        <div className="mb-4">
            <label htmlFor="context" className="block text-sm font-medium leading-6 text-gray-900">
                Extra Context
            </label>
            <div className="mt-2">
                <textarea
                id="context"
                name="context"
                rows={3}
                className="block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                placeholder="Add any extra details to assist the parser (e.g., 'Corner lot, recently renovated')..."
                value={extraContext}
                onChange={(e) => setExtraContext(e.target.value)}
                />
            </div>
            <p className="mt-2 text-sm text-gray-500">
                Optional. Provide additional context to improve parsing accuracy.
            </p>
        </div>

        <div className="flex justify-end">
            <button
            onClick={handleParse}
            disabled={isParsing}
            className={`rounded-md px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                isParsing
                ? "bg-blue-400 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-500 focus-visible:outline-blue-600"
            }`}
            >
            {isParsing ? "Parsing..." : isParsed ? "Reparse" : "Parse Document"}
            </button>
        </div>
      </div>

      {parsedContent && (
        <div className="space-y-2">
            <h3 className="text-lg font-medium text-gray-900">Parsed Content</h3>
            <JsonViewer data={parsedContent} />
        </div>
      )}

      {/* Simple Modal */}
      {isCheckModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
          <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setIsCheckModalOpen(false)}></div>
          <div className="relative transform overflow-hidden rounded-lg bg-white px-4 pb-4 pt-5 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
            <div>
              <div className="mt-3 text-center sm:mt-5 sm:text-left">
                <h3 className="text-base font-semibold leading-6 text-gray-900">
                  Check Import Status
                </h3>
                <div className="mt-2 text-center sm:text-left">
                  <p className="text-sm text-gray-500">
                    Verify if this address or property already exists in the database.
                  </p>
                  
                  <div className="mt-4 space-y-3">
                    <div>
                        <label htmlFor="address" className="block text-xs font-medium text-gray-700">Address / Common Name</label>
                        <input
                            id="address"
                            type="text"
                            className="mt-1 block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                            placeholder="e.g. 123 Main St"
                            value={checkQuery}
                            onChange={(e) => setCheckQuery(e.target.value)}
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="instrument" className="block text-xs font-medium text-gray-700">Instrument #</label>
                             <input
                                id="instrument"
                                type="text"
                                className="mt-1 block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                                placeholder="Optional"
                                value={checkInstrument}
                                onChange={(e) => setCheckInstrument(e.target.value)}
                            />
                        </div>
                         <div>
                            <label htmlFor="apn" className="block text-xs font-medium text-gray-700">APN</label>
                             <input
                                id="apn"
                                type="text"
                                className="mt-1 block w-full rounded-md border-0 py-1.5 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm sm:leading-6"
                                placeholder="Optional"
                                value={checkApn}
                                onChange={(e) => setCheckApn(e.target.value)}
                            />
                        </div>
                    </div>
                  </div>

                  {checkMatches && checkMatches.length > 0 && (
                      <div className="mt-4">
                          <h4 className="text-xs font-semibold text-gray-900 mb-1">Potential Matches Found:</h4>
                          <div className="max-h-60 overflow-y-auto rounded border border-gray-200">
                              <JsonViewer data={checkMatches} />
                          </div>
                      </div>
                  )}

                   {isImported === false && checkMatches && checkMatches.length === 0 && (
                      <div className="mt-4 rounded-md bg-green-50 p-2 text-sm text-green-700">
                          No matches found. Safe to import.
                      </div>
                  )}
                </div>
            </div>
            <div className="mt-5 sm:mt-6 sm:grid sm:grid-flow-row-dense sm:grid-cols-2 sm:gap-3">
              <button
                type="button"
                className="inline-flex w-full justify-center rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:col-start-2"
                onClick={handleCheckImport}
                disabled={isChecking}
              >
                {isChecking ? "Checking..." : "Check Database"}
              </button>
              <button
                type="button"
                className="mt-3 inline-flex w-full justify-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 sm:col-start-1 sm:mt-0"
                onClick={() => setIsCheckModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
