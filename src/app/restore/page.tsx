"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PROJECTS_STORAGE_KEY,
  normalizeProjectsMap,
  type ProjectsMap,
} from "~/utils/projectStore";

// RAW BACKUP DATA - Removed to rely on file upload


export default function RestorePage() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleRestore = () => {
    try {
      // In a real scenario, I would paste the FULL JSON here. 
      // Since I am an AI constructing this, I will fetch the JSON from the server 
      // (if I placed it in public) OR I will guide the user to paste it.
      // BUT, the user asked for a "script". 
      // I will implement a File Upload input so they can just upload their .json file!
    } catch (e) {
      console.error(e);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content) as ProjectsMap;
        
        // Normalize and Validate
        const normalized = normalizeProjectsMap(parsed);
        
        // Save to LocalStorage
        window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(normalized));
        
        setStatus("success");
        setMessage(`Successfully restored ${Object.keys(normalized).length} projects.`);
      } catch (error) {
        setStatus("error");
        setMessage("Failed to parse or restore backup file.");
        console.error(error);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
        <h1 className="mb-4 text-xl font-bold text-gray-900">Restore Projects</h1>
        <p className="mb-6 text-sm text-gray-600">
          Upload your <code>backup-data--full.json</code> file to restore your projects.
          <br />
          <strong className="text-red-600">Warning: This will overwrite existing projects!</strong>
        </p>

        <div className="mb-6">
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Select Backup File
          </label>
          <input
            type="file"
            accept=".json"
            onChange={handleFileUpload}
            className="block w-full cursor-pointer rounded-lg border border-gray-300 bg-gray-50 text-sm text-gray-900 focus:outline-none"
          />
        </div>

        {status === "success" && (
            <div className="mb-6 rounded-md bg-green-50 p-4 text-sm text-green-700">
                {message}
                <div className="mt-2">
                    <button 
                        onClick={() => router.push('/projects')}
                        className="font-bold underline hover:text-green-800"
                    >
                        Go to Projects
                    </button>
                </div>
            </div>
        )}

        {status === "error" && (
            <div className="mb-6 rounded-md bg-red-50 p-4 text-sm text-red-700">
                {message}
            </div>
        )}
        
        <div className="border-t pt-4">
             <a href="/projects" className="text-sm text-gray-500 hover:text-gray-900">Cancel and return to Projects</a>
        </div>
      </div>
    </div>
  );
}
