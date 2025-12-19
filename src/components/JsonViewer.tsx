"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

// Dynamically import react-json-view to avoid SSR issues
const ReactJson = dynamic(() => import("react-json-view"), { ssr: false });

interface JsonViewerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export function JsonViewer({ data }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-lg bg-[#272822] shadow-sm ring-1 ring-gray-900/5">
      <div className="absolute right-2 top-2 z-10">
        <button
          onClick={handleCopy}
          className={`rounded-md px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
            copied
              ? "bg-green-600 hover:bg-green-500"
              : "bg-gray-700 hover:bg-gray-600"
          }`}
        >
          {copied ? "Copied!" : "Copy JSON"}
        </button>
      </div>
      <div className="p-4 text-xs">
          <ReactJson 
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            src={data} 
            theme="monokai" 
            iconStyle="triangle"
            enableClipboard={false} 
            displayDataTypes={false} 
            displayObjectSize={false}
            collapsed={false}
            style={{ backgroundColor: 'transparent' }}
          />
      </div>
    </div>
  );
}
