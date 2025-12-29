"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

// Dynamically import react-json-view to avoid SSR issues
const ReactJson = dynamic(() => import("react-json-view"), { ssr: false });

import CodeEditor from '@uiw/react-textarea-code-editor';

interface JsonViewerProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  value?: string;
  onChange?: (value: string) => void;
  // Legacy props for tree-view editing (optional)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onEdit?: (edit: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onAdd?: (edit: any) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onDelete?: (edit: any) => void;
}

import { useTheme } from "~/components/ThemeProvider";

export function JsonViewer({ data, value, onChange, onEdit, onAdd, onDelete }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);
  const { theme } = useTheme();

  const handleCopy = async () => {
    try {
      const textToCopy = value ?? JSON.stringify(data, null, 2);
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const isTextMode = onChange !== undefined;

  return (
    <div className="relative h-full overflow-hidden rounded-lg bg-gray-50 shadow-sm ring-1 ring-gray-900/5 dark:bg-[#272822] dark:ring-gray-700">
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
      <div className={`${isTextMode ? 'p-0' : 'p-4'} h-full text-xs overflow-auto`}>
          {isTextMode ? (
              <CodeEditor
                  value={value ?? ""}
                  language="json"
                  placeholder="Please enter JSON code."
                  onChange={(evn) => onChange && onChange(evn.target.value)}
                  padding={15}
                  data-color-mode={theme}
                  style={{
                      fontSize: 12,
                      backgroundColor: "transparent",
                      fontFamily: 'ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace',
                      minHeight: "100%",
                  }}
              />
          ) : (
            <ReactJson 
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                src={data} 
                theme={theme === "dark" ? "monokai" : "rjv-default"} 
                iconStyle="triangle"
                enableClipboard={false} 
                displayDataTypes={false} 
                displayObjectSize={false}
                collapsed={false}
                style={{ backgroundColor: 'transparent' }}
                onEdit={onEdit}
                onAdd={onAdd}
                onDelete={onDelete}
            />
          )}
      </div>
    </div>
  );
}
